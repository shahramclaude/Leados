/**
 * app/ui/credibility-modals.js — the three dialogs of the Borrowed Evidence
 * terminal (Schema v71).
 *
 *   openFreezeFrameDialog   freeze one unit's borrowed AND own-data forecasts,
 *                           previewed before the write, to be graded later
 *   openDeclareDialog       the leader's exchangeability ruling for a group,
 *                           with the written reason the ruling requires
 *   openConventionsDialog   the declared conventions, each refused outside its
 *                           band rather than silently clamped
 */

import { h, toast, openModal } from './dom.js';
import { addDays } from '../core/time.js';

function field(id, label, control, hint = null) {
  return h('div', { class: 'stack-xs' },
    h('label', { for: id }, label),
    control,
    hint ? h('span', { class: 'muted small' }, hint) : null);
}

/* -------------------------------------------------------------- freeze */

export function openFreezeFrameDialog(ctx, report, preset = {}) {
  const groups = report.groups.filter((g) => g.borrowing && g.units.some((u) => u.n > 0));
  if (!groups.length) {
    toast('No group borrows yet, so there is no borrowed estimate to freeze.', 'neutral');
    return null;
  }
  const open = new Set((ctx.state.credibilityFrames || [])
    .filter((f) => f && !f.graded && !f.lapsedOn).map((f) => `${f.groupId}:${f.unitId}`));
  const options = [];
  for (const group of groups) {
    for (const unit of group.units.filter((u) => u.n > 0)) {
      const key = `${group.id}:${unit.id}`;
      options.push(h('option', {
        value: key,
        ...(open.has(key) ? { disabled: true } : {}),
        ...(preset.groupId === group.id && preset.unitId === unit.id ? { selected: true } : {}),
      }, `${group.label} — ${unit.label} (${unit.x}/${unit.n})${open.has(key) ? ' · already open' : ''}`));
    }
  }
  const select = h('select', { id: 'cre-freeze-unit' }, ...options);
  const horizon = h('input', { id: 'cre-freeze-horizon', type: 'number', min: '1', max: '40', step: '1', value: String(report.conventions.horizonN) });
  const reviewOn = h('input', { id: 'cre-freeze-review', type: 'date', value: addDays(report.today, report.conventions.reviewDays) });
  const preview = h('div', { class: 'callout stack-xs', 'aria-live': 'polite' });
  const refresh = () => {
    const [groupId, unitId] = String(select.value).split(':');
    const group = report.groups.find((g) => g.id === groupId);
    const unit = group && group.units.find((u) => u.id === unitId);
    preview.replaceChildren();
    if (!unit) return;
    preview.append(
      h('strong', null, `Borrowed ${unit.borrowedPct}% vs own record ${unit.jeffreysPct}% (Jeffreys, ${unit.x}/${unit.n})`),
      h('span', { class: 'muted small' }, `Both forecasts are frozen now and scored by Brier on the first ${horizon.value || report.conventions.horizonN} outcomes recorded before ${reviewOn.value || 'the review day'}. Own weight today: ${unit.zPct}%.`),
    );
  };
  for (const node of [select, horizon, reviewOn]) node.addEventListener('change', refresh);
  refresh();
  const modal = openModal({
    title: 'Freeze a borrowing forecast',
    description: 'A frozen frame is the only way to learn whether borrowing helps here: it records what the pool said and what the unit alone said, before the outcomes arrive.',
    body: h('div', { class: 'stack' },
      field('cre-freeze-unit', 'Unit', select, 'Units with an open frame are disabled: one claim per unit is tested at a time.'),
      field('cre-freeze-horizon', 'Outcomes to grade on', horizon, '1 to 40. The first outcomes after today count.'),
      field('cre-freeze-review', 'Review day', reviewOn, 'Must be in the future.'),
      preview),
    footer: [
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const [groupId, unitId] = String(select.value).split(':');
          const result = ctx.api.freezeCredibilityFrame({ groupId, unitId, horizonN: horizon.value, reviewOn: reviewOn.value });
          if (result && result.ok) {
            modal.close();
            toast('Frame frozen. It will be graded against what follows.', 'good');
          } else {
            toast((result && result.error) || 'Could not freeze the frame.', 'bad');
          }
        },
      }, 'Freeze'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'),
    ],
  });
  return modal;
}

/* ------------------------------------------------------------- declare */

export function openDeclareDialog(ctx, group) {
  const current = group.declaration;
  const allowId = `cre-declare-allow-${group.id}`;
  const refuseId = `cre-declare-refuse-${group.id}`;
  const allow = h('input', { type: 'radio', name: 'cre-declare', id: allowId, value: 'allow', ...(current && current.allowed === false ? {} : { checked: true }) });
  const refuse = h('input', { type: 'radio', name: 'cre-declare', id: refuseId, value: 'refuse', ...(current && current.allowed === false ? { checked: true } : {}) });
  const reason = h('textarea', {
    id: 'cre-declare-reason',
    rows: 3,
    maxlength: '400',
    placeholder: 'e.g. “Goals and Feedback signals read different records and fail for different reasons.”',
  }, current ? current.reason : '');
  const modal = openModal({
    title: `Are the ${group.label.toLowerCase()} one kind of thing?`,
    description: `Borrowing assumes the ${group.unitLabel}s in ${group.groupLabel.toLowerCase()} are draws from one distribution. That is a judgement about the world, not a statistic, so the engine obeys your ruling and stops asking for 90 days.`,
    body: h('div', { class: 'stack' },
      group.heterogeneity && group.heterogeneity.x2 !== null
        ? h('p', { class: 'muted small' }, `Evidence today: χ² ${group.heterogeneity.x2} on ${group.heterogeneity.df} df, p ${group.heterogeneity.pValue}, I² ${group.heterogeneity.i2Pct}%${group.heterogeneity.approximate ? ' (approximate — sparse cells)' : ''}.`)
        : null,
      h('label', { class: 'cre-inline', for: allowId }, allow, h('span', null, 'Yes — let them borrow from each other')),
      h('label', { class: 'cre-inline', for: refuseId }, refuse, h('span', null, 'No — judge each on its own record only')),
      field('cre-declare-reason', 'Why (required, one sentence or more)', reason, 'The reason is stored with the ruling and printed wherever the group is.')),
    footer: [
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.declareCredibility({ groupId: group.id, allowed: !refuse.checked, reason: reason.value });
          if (result && result.ok) {
            modal.close();
            toast(refuse.checked ? 'Ruling recorded: this group will not borrow.' : 'Ruling recorded: this group may borrow.', 'good');
          } else {
            toast((result && result.error) || 'Could not record the ruling.', 'bad');
          }
        },
      }, 'Record the ruling'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'),
    ],
  });
  return modal;
}

/* --------------------------------------------------------- conventions */

const CONVENTION_FIELDS = [
  ['credibilityDecisivePct', 'Posterior probability for a borrowed verdict (%)', 80, 99, 'decisivePct'],
  ['credibilityMinUnitN', 'Own-data verdict refused below (outcomes)', 2, 20, 'minUnitN'],
  ['credibilityPremiseFloorPct', 'Assumption hold-rate floor (%)', 20, 95, 'premiseFloorPct'],
  ['credibilityDelegationFloorPct', 'Delegation on-time floor (%)', 20, 95, 'delegationFloorPct'],
  ['credibilityCheckpointDays', 'Delegation checkpoint window (days)', 3, 90, 'checkpointDays'],
  ['credibilityHorizonN', 'Frame horizon (outcomes)', 1, 40, 'horizonN'],
  ['credibilityReviewDays', 'Frame review period (days)', 7, 120, 'reviewDays'],
  ['credibilitySkillFloor', 'Graded frames before skill is scored', 3, 40, 'skillFloor'],
];

export function openConventionsDialog(ctx, conventions) {
  const inputs = CONVENTION_FIELDS.map(([key, label, min, max, prop]) => {
    const input = h('input', { id: `cre-conv-${key}`, type: 'number', min: String(min), max: String(max), step: '1', value: String(conventions[prop]) });
    return { key, label, min, max, input };
  });
  const auto = h('input', { type: 'checkbox', id: 'cre-conv-auto', ...(conventions.autoPropagate ? { checked: true } : {}) });
  const modal = openModal({
    title: 'Borrowed evidence conventions',
    description: 'Each is a claim about how much evidence you require. A value outside its band is refused, never quietly clamped.',
    body: h('div', { class: 'stack' },
      ...inputs.map((row) => field(row.input.id, row.label, row.input, `${row.min}–${row.max}`)),
      h('label', { class: 'cre-inline', for: 'cre-conv-auto' }, auto, h('span', null, 'Propagate automatically when evidence arrives (off: explicit scans only)')),
      h('p', { class: 'muted small' }, 'The signal-family floor is the Signal Integrity Board’s declared precision floor and is changed there, so the two modules can never disagree about the bar.')),
    footer: [
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const payload = { credibilityAutoPropagate: auto.checked };
          for (const row of inputs) payload[row.key] = row.input.value;
          const result = ctx.api.setCredibilityConventions(payload);
          if (result && result.ok) {
            modal.close();
            toast('Conventions saved.', 'good');
          } else {
            toast((result && result.error) || 'Could not save the conventions.', 'bad');
          }
        },
      }, 'Save'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'),
    ],
  });
  return modal;
}
