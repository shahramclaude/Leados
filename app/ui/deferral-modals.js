/**
 * app/ui/deferral-modals.js — the freeze dialog for the Deferral Option
 * Terminal (Schema v68).
 *
 * Four inputs, all of which the underlying record cannot supply on its own:
 * the commitment cost (what committing sinks), the carry price (what one more
 * week of waiting costs), the volatility (derived by default) and the window.
 * The dialog previews the verdict from the same engine before writing, so a
 * leader never freezes a frame whose numbers they have not seen.
 */

import { h, toast, openModal } from './dom.js';
import { dayKey, round } from '../core/time.js';

function money(amount, currency) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '—';
  return `${currency} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function pct(value) {
  if (!Number.isFinite(Number(value))) return '—';
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function field(id, label, control, hint = null) {
  return h('div', { class: 'stack-xs' },
    h('label', { for: id }, label),
    control,
    hint ? h('span', { class: 'muted small' }, hint) : null);
}

export function openFreezeDeferralDialog(ctx, frame) {
  if (!frame) {
    toast('Choose a priced open call first.', 'bad');
    return;
  }
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const number = (value, step = '0.01') => h('input', {
    type: 'number',
    min: '0',
    step,
    value: Number.isFinite(Number(value)) ? String(round(Number(value), 4)) : '',
  });
  const commit = number(frame.commitCost);
  commit.id = 'dro-modal-commit';
  const carry = number(frame.carryPerWeek);
  carry.id = 'dro-modal-carry';
  const sigma = number(frame.sigma, '0.01');
  sigma.id = 'dro-modal-sigma';
  const days = number(frame.horizonDays, '1');
  days.id = 'dro-modal-days';
  const preview = h('div', { class: 'stack-xs', 'aria-live': 'polite' });

  function overrides() {
    return {
      commitCost: commit.value === '' ? undefined : Number(commit.value),
      carryPerWeek: carry.value === '' ? undefined : Number(carry.value),
      sigma: sigma.value === '' ? undefined : Number(sigma.value),
      horizonDays: days.value === '' ? undefined : Number(days.value),
    };
  }

  function renderPreview() {
    const report = ctx.api.deferralRead(frame.decisionId, overrides());
    const live = report?.focused;
    preview.replaceChildren();
    if (!live) {
      preview.appendChild(h('p', { class: 'muted' }, 'No frame can be built from these inputs.'));
      return;
    }
    if (live.refusal) {
      preview.appendChild(h('p', { class: 'text-warn' }, `Withheld: ${live.refusal}`));
      return;
    }
    preview.appendChild(h('p', null,
      h('strong', null, `${live.verdict.label} — `),
      live.verdict.headline));
    preview.appendChild(h('p', { class: 'muted small' },
      `Premium ${money(live.option.premium, live.currency)} · boundary ${live.option.thresholdNow === null ? '—' : money(live.option.thresholdNow, live.currency)} · P(commit by deadline) ${live.option.exerciseProbabilityPct}% · expected wait ${live.option.expectedWaitDays === null ? '—' : `${live.option.expectedWaitDays} day(s)`} · winds up ${live.deadline}.`));
    preview.appendChild(h('p', { class: 'muted small' },
      'Freezing writes one probability and one deadline. It does not choose an option, move a date or message anyone.'));
  }

  for (const control of [commit, carry, sigma, days]) control.addEventListener('input', renderPreview);
  renderPreview();

  const dialog = openModal({
    title: 'Freeze a deferral frame',
    description: `Price the option to wait on “${frame.title}” before the answer is known. The frozen number is graded once against the decision’s recorded date.`,
    body: h('div', { class: 'stack' },
      field('dro-modal-commit', `Commitment cost (${frame.currency})`, commit,
        'What committing now sinks and cannot be recovered. Zero means committing is free — and a free commitment has no option value.'),
      field('dro-modal-carry', `Carry per week (${frame.currency})`, carry,
        'What one more week of waiting costs. The default is the Cost of Waiting terminal’s derived linear delay price.'),
      field('dro-modal-sigma', 'Annualised volatility', sigma,
        'Derived from your own settled magnitudes by robust log-scale spread. Overriding it turns the frame into a declared belief.'),
      field('dro-modal-days', 'Window (days)', days,
        `Capped at the workspace's maximum of ${Number(ctx.state.settings?.deferralMaxHorizonDays || 180)} days. Today is ${dayKey(now)}.`),
      preview),
    footer: [
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.freezeDeferralFrame(frame.decisionId, overrides());
          if (result && result.ok) {
            dialog.close();
            toast(result.warning
              ? `Frozen in memory but NOT SAVED: ${result.warning}`
              : 'Frame frozen. It is now a prediction that a later date can settle.', result.warning ? 'bad' : 'good');
            ctx.navigate('#/deferral?panel=frozen');
          } else {
            toast((result && result.error) || 'Could not freeze the frame.', 'bad');
          }
        },
      }, 'Freeze the frame'),
      h('button', {
        class: 'btn btn-quiet',
        type: 'button',
        onClick: () => dialog.close(),
      }, 'Cancel'),
    ],
  });
  return dialog;
}
