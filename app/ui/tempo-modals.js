/**
 * app/ui/tempo-modals.js — arm / edit a decision timebox, or abandon one.
 *
 * The dialog is the only place a human records the two inputs the engine cannot
 * derive from a record: the edge they believe the leading option has over the
 * runner-up, and how unsure that edge is. Everything else (value at stake,
 * guardrail date, delay profile, carrying cost) is prefilled from linked
 * records and shown with its source, so the leader edits a position instead of
 * filling in a form. A live preview re-runs the pure engine on every keystroke —
 * no write happens until Arm.
 */

import { h, openModal, toast } from './dom.js';
import {
  DELAY_PROFILES,
  DELAY_PROFILE_LABELS,
  DELAY_PROFILE_HELP,
  TEMPO_MIN_SAMPLES,
  evaluateDecisionTiming,
} from '../core/domain/decisionTempo.js';

function money(currency, amount) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '—';
  return `${currency || ''} ${Math.round(Number(amount)).toLocaleString('en-US')}`.trim();
}

function field({ id, label, hint = null, control, wide = false }) {
  return h(
    'div',
    { class: `field${wide ? ' field-wide' : ''}` },
    h('label', { class: 'field-label', for: id }, label),
    control,
    hint ? h('p', { class: 'field-hint' }, hint) : null,
  );
}

function numberInput({ id, value, min = 0, step = 'any', placeholder = '' }) {
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

function termsList(valuation) {
  if (!valuation || !valuation.terms.length) {
    return h('p', { class: 'muted small' },
      'No money is linked to this decision yet. Link an operational case, budget line, portfolio item or negotiation, or set a value override below. An unpriced decision can still be timed in days — it just cannot be priced.');
  }
  return h('ul', { class: 'tempo-terms' },
    ...valuation.terms.map((t) => h('li', null,
      h('span', { class: 'tempo-term-label' }, t.label),
      h('span', { class: 'tempo-term-value' },
        t.amount !== null && t.amount !== undefined
          ? money(t.currency, t.amount)
          : `${Math.round(t.days).toLocaleString('en-US')} person-days`),
      h('span', { class: 'muted tiny tempo-term-basis' }, t.basis),
    )),
    valuation.otherCurrencies.length
      ? h('li', { class: 'tempo-terms-note' },
          `Other currencies are never added in: ${valuation.otherCurrencies.map((c) => money(c.currency, c.amount)).join(' · ')}. Model this decision in its dominant currency (${valuation.dominant?.currency}).`)
      : null,
  );
}

export function openTempoScheduleDialog(ctx, decision, { existing = null, onSaved = null } = {}) {
  if (!decision) return null;
  const draft = ctx.api.tempoScheduleDraft(decision.id);
  if (!draft.ok) {
    toast(draft.error || 'That decision is no longer available.', 'bad');
    return null;
  }
  const { defaults, valuation } = draft;
  const base = existing || draft.existing || null;
  // A proposal is not a commitment: arming it is the act that writes the date the
  // leader is willing to be held to, so the verb has to say so.
  const alreadyArmed = base?.status === 'armed';
  const pick = (key, fallback) => (base && base[key] !== undefined && base[key] !== null ? base[key] : fallback);

  const profile = h('select', { id: 'tempo-profile', name: 'profile', 'aria-describedby': 'tempo-profile-help' },
    ...DELAY_PROFILES.map((key) => h('option', { value: key }, DELAY_PROFILE_LABELS[key])));
  profile.value = pick('profile', defaults.profile);
  const profileHelp = h('p', { class: 'field-hint', id: 'tempo-profile-help' }, DELAY_PROFILE_HELP[profile.value] || '');
  profile.addEventListener('change', () => {
    profileHelp.textContent = DELAY_PROFILE_HELP[profile.value] || '';
    update();
  });

  const decideBy = h('input', {
    id: 'tempo-decide-by', name: 'decideBy', type: 'date',
    value: pick('decideBy', defaults.decideBy),
    min: ctx.state ? new Date(ctx.now).toISOString().slice(0, 10) : undefined,
  });
  const advantage = numberInput({ id: 'tempo-advantage', value: pick('advantageAmount', ''), placeholder: `e.g. ${Math.max(1000, Math.round((valuation.dominant?.amount || 20000) * 0.25))}` });
  const uncertainty = numberInput({ id: 'tempo-uncertainty', value: pick('uncertaintyPct', ''), min: 0, placeholder: 'e.g. 60' });
  const halfLife = numberInput({ id: 'tempo-half-life', value: pick('halfLifeDays', defaults.halfLifeDays), min: 1 });
  const windowWeeks = numberInput({ id: 'tempo-window', value: pick('windowWeeks', defaults.windowWeeks), min: 1 });
  const deadline = numberInput({ id: 'tempo-deadline', value: pick('deadlineDays', defaults.deadlineDays), min: 0 });
  const rate = numberInput({ id: 'tempo-rate', value: base && base.delayCostPerWeek !== null && base.delayCostPerWeek !== undefined ? base.delayCostPerWeek : '', placeholder: 'derived from value ÷ window' });
  const override = numberInput({ id: 'tempo-override', value: pick('valueAtStakeOverride', ''), placeholder: valuation.dominant ? String(valuation.dominant.amount) : 'no money linked' });
  const infoWeeks = numberInput({ id: 'tempo-info-weeks', value: pick('infoWeeks', ''), placeholder: 'e.g. 2' });
  const infoCost = numberInput({ id: 'tempo-info-cost', value: pick('infoCostAmount', 0), min: 0 });
  const infoNote = h('input', { id: 'tempo-info-note', name: 'infoCostNote', type: 'text', placeholder: 'e.g. two customer interviews + one pilot run', value: pick('infoCostNote', '') });
  const notes = h('textarea', { id: 'tempo-notes', name: 'notes', rows: 3, placeholder: 'What are you waiting for, and what would change your mind?' }, pick('notes', ''));
  const error = h('p', { class: 'field-error', id: 'tempo-error', role: 'alert' });
  const preview = h('div', { class: 'tempo-preview', 'aria-live': 'polite' });

  const values = () => ({
    profile: profile.value,
    decideBy: decideBy.value,
    advantageAmount: advantage.value === '' ? null : Number(advantage.value),
    uncertaintyPct: uncertainty.value === '' ? null : Number(uncertainty.value),
    halfLifeDays: halfLife.value === '' ? defaults.halfLifeDays : Number(halfLife.value),
    windowWeeks: windowWeeks.value === '' ? defaults.windowWeeks : Number(windowWeeks.value),
    deadlineDays: deadline.value === '' ? defaults.deadlineDays : Number(deadline.value),
    delayCostPerWeek: rate.value === '' ? null : Number(rate.value),
    valueAtStakeOverride: override.value === '' ? null : Number(override.value),
    infoWeeks: infoWeeks.value === '' ? null : Number(infoWeeks.value),
    infoCostAmount: infoCost.value === '' ? 0 : Number(infoCost.value),
    infoCostNote: infoNote.value,
    notes: notes.value,
    currency: defaults.currency,
  });

  function update() {
    const v = values();
    const synthetic = {
      ...v,
      id: base?.id || 'preview',
      status: 'armed',
      derivedAmount: valuation.dominant?.amount ?? null,
    };
    const timing = evaluateDecisionTiming({ decision, valuation, schedule: synthetic, now: ctx.now, settings: ctx.state.settings });
    const verdictTone = timing.verdict === 'gather-first' ? 'caution' : timing.verdict === 'decide-now' ? 'good' : 'neutral';
    preview.replaceChildren(
      h('div', { class: 'tempo-preview-head' },
        h('span', { class: `badge badge-${verdictTone}` }, timing.verdict === 'gather-first' ? 'Waiting pays' : timing.verdict === 'decide-now' ? 'Decide now' : timing.verdict === 'unpriced' ? 'Unpriced' : 'Needs the edge + uncertainty'),
        h('span', { class: 'muted tiny' }, `${timing.typeLabel} · guardrail ${timing.guardrailDays} days · decide by ${timing.decideBy}`),
      ),
      h('p', { class: 'small' }, timing.verdictReason),
      h('dl', { class: 'tempo-preview-grid' },
        h('div', null, h('dt', null, 'Value at stake'), h('dd', null, money(timing.currency, timing.amount))),
        h('div', null, h('dt', null, 'Carrying cost'), h('dd', null, `${money(timing.currency, timing.ratePerWeek)} / week`)),
        h('div', null, h('dt', null, 'Net value now'), h('dd', null, money(timing.currency, timing.netNow))),
        h('div', null, h('dt', null, 'Best plan'), h('dd', null, timing.bestPlan ? `wait ${timing.bestPlan.day}d · net ${money(timing.currency, timing.bestPlan.net)}` : '—')),
        h('div', null, h('dt', null, 'Switch probability'), h('dd', null, timing.canPriceInformation ? `${Math.round((timing.scenarios[0]?.switchProbability ?? 0) * 100)}%` : '—')),
        h('div', null, h('dt', null, 'CD3 (rank only)'), h('dd', null, timing.amount ? String(Math.round((timing.ratePerWeek / Math.max(0.5, (timing.infoPlanDays || 5) / 7)) * 100) / 100) : '—')),
      ),
    );
    return timing;
  }

  for (const control of [profile, decideBy, advantage, uncertainty, halfLife, windowWeeks, deadline, rate, override, infoWeeks, infoCost, infoNote, notes]) {
    control.addEventListener('input', update);
  }

  const form = h('form', { class: 'form', novalidate: true },
    h('div', { class: 'tempo-derived' },
      h('h3', { class: 'tempo-derived-title' }, 'Derived from linked records'),
      h('p', { class: 'muted tiny' }, `Value at stake is derived from ${valuation.termCount} linked record(s) and never invented. Currency is never mixed.`),
      termsList(valuation),
    ),
    h('div', { class: 'field-row' },
      field({ id: 'tempo-profile', label: 'Delay profile', control: profile, hint: DELAY_PROFILE_HELP[profile.value] }),
      field({ id: 'tempo-decide-by', label: 'Decide by', control: decideBy, hint: 'The date this call stops being a plan and becomes debt.' }),
    ),
    h('div', { class: 'field-row' },
      field({ id: 'tempo-advantage', label: 'Believed edge of the leading option', control: advantage, hint: 'Money per the dominant currency. How much better is your leading option than the runner-up, in your honest estimate?' }),
      field({ id: 'tempo-uncertainty', label: 'How unsure is that edge (%)', control: uncertainty, hint: '0% = you know exactly; 100% = the edge could be as large as the value at stake. Used as the standard deviation of the edge.' }),
    ),
    h('div', { class: 'field-row' },
      field({ id: 'tempo-half-life', label: 'Evidence half-life (days)', control: halfLife, hint: `Days of gathering to halve the ambiguity. Below ${TEMPO_MIN_SAMPLES} measured latencies nothing is inferred — this is your assumption, not a model default.` }),
      field({ id: 'tempo-window', label: 'Erosion window (weeks)', control: windowWeeks, hint: 'Weeks until the value at stake would be fully eroded if nothing is decided. Sets the default weekly carrying cost.' }),
    ),
    h('div', { class: 'field-row' },
      field({ id: 'tempo-deadline', label: 'Fixed date offset (days)', control: deadline, hint: 'Used by the fixed-date profile: nothing is lost before this offset, then cost accrues at 2.5×.' }),
      field({ id: 'tempo-rate', label: 'Carrying cost per week (override)', control: rate, hint: 'Leave blank to derive value ÷ erosion window. A recorded rate is never overwritten by the derivation.' }),
    ),
    h('div', { class: 'field-row' },
      field({ id: 'tempo-override', label: 'Value override', control: override, hint: 'Use only when the linked records understate the stake; the override is recorded and labelled.' }),
      field({ id: 'tempo-info-weeks', label: 'Evidence plan (weeks)', control: infoWeeks, hint: 'How long the evidence gathering takes. This is the duration that CD3 divides by.' }),
    ),
    h('div', { class: 'field-row' },
      field({ id: 'tempo-info-cost', label: 'Evidence cost (money)', control: infoCost, hint: 'Sampling cost. An evidence plan with no cost is treated as free — say so explicitly.' }),
      field({ id: 'tempo-info-note', label: 'What the evidence is', control: infoNote, hint: 'Name the test, interview or pilot. "More analysis" is not an evidence plan.' }),
    ),
    field({ id: 'tempo-notes', label: 'Reasoning (optional)', control: notes, wide: true }),
    preview,
    error,
  );

  const dialog = openModal({
    title: `${alreadyArmed ? 'Edit' : 'Arm'} decision timebox · ${decision.title}`,
    description: 'A timebox is a timed economic position, not a reminder. The engine prices delay and the option to wait from your own records; you own the edge, the uncertainty and the date.',
    body: h('div', { class: 'stack-md' },
      h('p', { class: 'muted small' },
        `Classified as ${defaults.decisionType} — ${defaults.typeReasons.join('; ')}.`),
      form,
    ),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const payload = values();
          if (!payload.decideBy) {
            error.textContent = 'Choose a decide-by date.';
            return;
          }
          const result = ctx.api.armTempoSchedule(decision.id, payload);
          if (!result.ok) {
            error.textContent = result.error || 'The timebox could not be saved.';
            return;
          }
          dialog.close();
          toast(result.schedule.status === 'armed' ? 'Decision timebox armed' : 'Timebox saved', 'good');
          if (typeof onSaved === 'function') onSaved(result);
          else ctx.refresh();
        },
      }, alreadyArmed ? 'Save timebox' : 'Arm timebox'),
    ],
    size: 'lg',
  });
  update();
  return dialog;
}

export function openTempoAbandonDialog(ctx, schedule, decisionTitle = 'this decision') {
  if (!schedule) return null;
  const reason = h('textarea', {
    id: 'tempo-abandon-reason',
    rows: 3,
    placeholder: 'Why is this timing plan no longer the right frame?',
    'aria-label': 'Reason for abandoning the timebox',
  });
  const error = h('p', { class: 'field-error', role: 'alert' });
  const dialog = openModal({
    title: 'Abandon this timebox',
    description: `The timebox for “${decisionTitle}” stays in the record as abandoned with your written reason. Nothing is deleted, and the decision itself is untouched.`,
    body: h('div', { class: 'stack-md' },
      h('label', { class: 'field-label', for: 'tempo-abandon-reason' }, 'Written reason'),
      reason,
      error,
    ),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-danger',
        type: 'button',
        onClick: () => {
          const result = ctx.api.abandonTempoSchedule(schedule.id, reason.value);
          if (!result.ok) {
            error.textContent = result.error || 'The timebox could not be abandoned.';
            return;
          }
          dialog.close();
          toast('Timebox abandoned with reason', 'good');
          ctx.refresh();
        },
      }, 'Abandon timebox'),
    ],
  });
  return dialog;
}
