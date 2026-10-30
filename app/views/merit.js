/**
 * app/views/merit.js — the Merit & Pay-Equity Terminal (`#/merit`, Schema v51).
 *
 * The screen a manager needs once a year and is given a spreadsheet for: a fixed
 * budget, a team of unequal market position and replaceability, and a
 * communication problem afterwards. Three questions, kept apart on purpose:
 *
 *   1. **Where should the money go?** Three priced policies, side by side, with
 *      the regret of choosing a worse one printed.
 *   2. **What pattern does the result make?** Band positioning, compression
 *      inside the reporting line, the external-hire premium, a four-fifths
 *      screen and an Oaxaca–Blinder decomposition with an interval on the
 *      adjusted gap.
 *   3. **Was the model right?** The departure predictions are frozen at
 *      finalization and scored later against who actually stayed.
 *
 * The page never claims a person's worth, never asks for a protected
 * characteristic, and never presents a model output as a market fact.
 */

import { h, toast, confirmDialog, openModal } from '../ui/dom.js';
import {
  pageHeader, card, stat, badge, banner, table, emptyState, kv, tabs,
} from '../ui/components.js';
import { progressBar } from '../ui/charts.js';
import { downloadText } from '../ui/download.js';
import { dayKey, formatDate } from '../core/time.js';
import {
  COMP_CONVENTIONS,
  COMP_DIMENSION_LABELS,
  COMP_DIMENSIONS,
  COMP_ORIGIN_LABELS,
  COMP_ORIGINS,
  COMP_STATUS_LABELS,
  buildCompBrief,
  fairnessReading,
  positionPay,
  retentionCalibration,
} from '../core/domain/comp.js';

const LEVELS = ['ic', 'senior', 'lead', 'manager', 'director', 'vp'];
const LEVEL_LABELS = {
  ic: 'Individual contributor',
  senior: 'Senior IC',
  lead: 'Lead',
  manager: 'Manager',
  director: 'Director',
  vp: 'VP',
};

function money(currency, value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${currency || 'USD'} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value))}`;
}

function pct(value, dp = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(dp)}%`;
}

function short(value, n = 90) {
  const text = String(value || '').trim();
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

function positionTone(position) {
  if (position === 'below') return 'warn';
  if (position === 'above') return 'neutral';
  if (position === 'in') return 'good';
  return 'neutral';
}

/* ------------------------------------------------------------- dialogs */

function openBandDialog(ctx, existing = null) {
  const today = dayKey(ctx.now);
  const level = h('select', { id: 'comp-band-level' },
    ...LEVELS.map((key) => h('option', { value: key, ...(existing?.level === key ? { selected: 'selected' } : {}) }, `${LEVEL_LABELS[key]} (${key})`)));
  const label = h('input', { id: 'comp-band-label', type: 'text', maxlength: '60', value: existing?.label || '' });
  const min = h('input', { id: 'comp-band-min', type: 'number', min: '1', step: '1000', value: existing ? String(existing.min) : '' });
  const mid = h('input', { id: 'comp-band-mid', type: 'number', min: '1', step: '1000', value: existing ? String(existing.mid) : '' });
  const max = h('input', { id: 'comp-band-max', type: 'number', min: '1', step: '1000', value: existing ? String(existing.max) : '' });
  const effective = h('input', { id: 'comp-band-effective', type: 'date', value: existing?.effectiveOn || today });
  const notes = h('textarea', { id: 'comp-band-notes', rows: '2', maxlength: '400' }, existing?.notes || '');

  const dialog = openModal({
    title: existing ? 'Edit the band' : 'Declare a band',
    description: 'A band is market structure you declare: the floor, midpoint and ceiling for a level. The app will not guess one, because every compa-ratio on the page is measured against it.',
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'comp-band-level' }, 'Level'), level),
        h('div', { class: 'stack-xs' }, h('label', { for: 'comp-band-label' }, 'Label'), label),
        h('div', { class: 'stack-xs' }, h('label', { for: 'comp-band-min' }, 'Floor'), min),
        h('div', { class: 'stack-xs' }, h('label', { for: 'comp-band-mid' }, 'Midpoint'), mid),
        h('div', { class: 'stack-xs' }, h('label', { for: 'comp-band-max' }, 'Ceiling'), max),
        h('div', { class: 'stack-xs' }, h('label', { for: 'comp-band-effective' }, 'Effective from'), effective)),
      h('div', { class: 'stack-xs' }, h('label', { for: 'comp-band-notes' }, 'How this range was set'), notes),
      h('p', { class: 'small muted' }, 'The midpoint is the anchor: a compa-ratio of 1.00 means paid at the midpoint. It is a positioning convention and not a merit standard — this app does not treat it as one.')),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const payload = {
            level: level.value,
            label: label.value,
            min: min.value,
            mid: mid.value,
            max: max.value,
            effectiveOn: effective.value,
            notes: notes.value,
          };
          const res = existing ? ctx.api.updateCompBand(existing.id, payload) : ctx.api.addCompBand(payload);
          if (!res.ok) {
            toast(res.error, 'bad');
            return;
          }
          dialog.close();
          toast(existing ? 'Band updated.' : 'Band declared.', 'good');
          ctx.refresh();
        },
      }, existing ? 'Save the band' : 'Declare the band'),
    ],
  });
}

function openCycleDialog(ctx) {
  const today = dayKey(ctx.now);
  const active = (ctx.state.people || []).filter((person) => person.status !== 'archived');
  const label = h('input', { id: 'comp-cycle-label', type: 'text', maxlength: '120', required: 'required' });
  const currency = h('input', { id: 'comp-cycle-currency', type: 'text', maxlength: '3', value: 'USD' });
  const effective = h('input', { id: 'comp-cycle-effective', type: 'date', value: today });
  const kind = h('select', { id: 'comp-cycle-kind' },
    h('option', { value: 'amount' }, 'A fixed budget in money'),
    h('option', { value: 'pool-pct' }, 'A percentage of payroll'));
  const value = h('input', { id: 'comp-cycle-value', type: 'number', min: '0', step: '500' });
  const dimension = h('select', { id: 'comp-cycle-dimension' },
    ...COMP_DIMENSIONS.map((key) => h('option', { value: key }, COMP_DIMENSION_LABELS[key])));
  const owner = h('select', { id: 'comp-cycle-owner' },
    h('option', { value: '' }, 'No single owner'),
    ...active.map((person) => h('option', { value: person.id }, person.name)));

  const dialog = openModal({
    title: 'Declare a merit cycle',
    description: 'The budget and the comparison are part of the declaration. A budget chosen after the allocations is not a budget — it is a description of what was spent.',
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'comp-cycle-label' }, 'Name'), label),
        h('div', { class: 'stack-xs' }, h('label', { for: 'comp-cycle-currency' }, 'Currency'), currency),
        h('div', { class: 'stack-xs' }, h('label', { for: 'comp-cycle-effective' }, 'New pay takes effect'), effective),
        h('div', { class: 'stack-xs' }, h('label', { for: 'comp-cycle-kind' }, 'Budget as'), kind),
        h('div', { class: 'stack-xs' }, h('label', { for: 'comp-cycle-value' }, 'Budget'), value),
        h('div', { class: 'stack-xs' }, h('label', { for: 'comp-cycle-dimension' }, 'Compare'), dimension),
        h('div', { class: 'stack-xs' }, h('label', { for: 'comp-cycle-owner' }, 'Who runs the cycle'), owner)),
      h('p', { class: 'small muted' }, 'The comparison dimension is what the fairness audit splits the team by. This app deliberately never asks for a protected characteristic: it audits a comparison you declare (how people joined, or which sub-team they sit in) and states that an unexplained gap is not evidence of discrimination.')),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.addMeritCycle({
            label: label.value,
            currency: currency.value,
            effectiveOn: effective.value,
            budgetKind: kind.value,
            budgetValue: value.value,
            comparisonDimension: dimension.value,
            ownerId: owner.value,
          });
          if (!res.ok) {
            toast(res.error, 'bad');
            return;
          }
          dialog.close();
          toast('Cycle declared. Now record the pay.', 'good');
          ctx.navigate(`#/merit?cycle=${encodeURIComponent(res.id)}`);
        },
      }, 'Declare the cycle'),
    ],
  });
}

function openRowDialog(ctx, cycle, reading, row) {
  const currency = cycle.currency;
  const person = row?.person || (ctx.state.people || []).find((candidate) => candidate.id === row?.personId) || null;
  const currentPay = h('input', { id: 'comp-row-current', type: 'number', min: '1', step: '500', value: row?.currentPay != null ? String(row.currentPay) : '' });
  const proposedPay = h('input', { id: 'comp-row-proposed', type: 'number', min: '0', step: '500', value: row?.proposedPay != null ? String(row.proposedPay) : '' });
  const level = h('select', { id: 'comp-row-level' },
    ...LEVELS.map((key) => h('option', { value: key, ...((row?.level || person?.level) === key ? { selected: 'selected' } : {}) }, LEVEL_LABELS[key])));
  const origin = h('select', { id: 'comp-row-origin' },
    ...COMP_ORIGINS.map((key) => h('option', { value: key, ...((row?.origin || 'unknown') === key ? { selected: 'selected' } : {}) }, COMP_ORIGIN_LABELS[key])));
  const concern = h('input', { id: 'comp-row-concern', type: 'checkbox', ...(row?.retentionConcern ? { checked: 'checked' } : {}) });
  const note = h('textarea', { id: 'comp-row-note', rows: '2', maxlength: '400' }, row?.note || '');
  const positionLine = h('p', { class: 'small muted', id: 'comp-row-position' });

  const sync = () => {
    const pay = Number(currentPay.value);
    const band = (ctx.state.compBands || []).filter((candidate) => candidate.level === level.value)
      .sort((a, b) => String(b.effectiveOn).localeCompare(String(a.effectiveOn)))[0] || null;
    if (!band) {
      positionLine.textContent = 'No band recorded for this level, so no compa-ratio can be measured. Declare one in the bands section.';
      return;
    }
    if (!Number.isFinite(pay) || pay <= 0) {
      positionLine.textContent = `Band: ${money(currency, band.min)} – ${money(currency, band.max)} (midpoint ${money(currency, band.mid)}). Record current pay to measure positioning.`;
      return;
    }
    const pos = positionPay(pay, band);
    positionLine.textContent = `Compa-ratio ${pos.compaRatio?.toFixed(2) ?? '—'} · ${pos.penetrationPct ?? '—'}% through the range · ${pos.label}.`;
  };
  currentPay.addEventListener('input', sync);
  level.addEventListener('change', sync);
  sync();

  const dialog = openModal({
    title: person ? `Pay decision for ${person.name}` : 'Pay decision',
    description: 'Current pay is what the proposal is measured against; the hire origin is what the external-premium audit compares; the retention concern is your own recorded judgement, and it is labelled as such wherever it is used.',
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'comp-row-current' }, 'Current pay'), currentPay),
        h('div', { class: 'stack-xs' }, h('label', { for: 'comp-row-proposed' }, 'Proposed pay'), proposedPay),
        h('div', { class: 'stack-xs' }, h('label', { for: 'comp-row-level' }, 'Level'), level),
        h('div', { class: 'stack-xs' }, h('label', { for: 'comp-row-origin' }, 'How they joined'), origin)),
      positionLine,
      h('div', { class: 'stack-xs' }, h('label', { for: 'comp-row-concern', class: 'inline' }, concern, ' I have a recorded retention concern about this person')),
      h('div', { class: 'stack-xs' }, h('label', { for: 'comp-row-note' }, 'Why this number'), note),
      h('p', { class: 'small muted' }, `No individual increase may exceed ${COMP_CONVENTIONS.maxAdjustPct}% here. Past that, it is a promotion or a market correction, and it needs its own decision record rather than a merit line.`)),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.setMeritRow(cycle.id, row.personId, {
            currentPay: currentPay.value === '' ? null : currentPay.value,
            proposedPay: proposedPay.value === '' ? null : proposedPay.value,
            level: level.value,
            origin: origin.value,
            retentionConcern: concern.checked,
            note: note.value,
          });
          if (!res.ok) {
            toast(res.error, 'bad');
            return;
          }
          dialog.close();
          toast('Pay decision recorded.', 'good');
          ctx.refresh();
        },
      }, 'Save the decision'),
    ],
  });
}

function openAddPeopleDialog(ctx, cycle, reading) {
  const present = new Set((cycle.rows || []).map((row) => row.personId));
  const available = (ctx.state.people || []).filter((person) => person.status !== 'archived' && !present.has(person.id));
  const dialog = openModal({
    title: 'Add people to the cycle',
    description: 'Adding a person creates an empty pay row. Nothing is estimated: the app will not guess a salary from a band, a level or a colleague.',
    body: available.length
      ? h('p', { class: 'small' }, `${available.length} active person(s) are not in this cycle. Adding them creates rows with no pay recorded, which the page will count as a missing decision rather than a zero.`)
      : h('p', { class: 'small' }, 'Everyone active is already in the cycle.'),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.syncMeritRoster(cycle.id);
          if (!res.ok) {
            toast(res.error, 'bad');
            return;
          }
          dialog.close();
          toast(`${res.added} row(s) added without pay.`, res.added ? 'good' : 'neutral');
          ctx.refresh();
        },
      }, 'Add the missing people'),
    ],
  });
}

/* -------------------------------------------------------------- sections */

function header(ctx, cycle) {
  return pageHeader({
    eyebrow: 'Merit & pay equity · Schema v51',
    title: 'Merit cycle',
    subtitle: 'A fixed budget, a team of unequal market position and unequal replaceability, and the pattern the result will make. Priced, decomposed and frozen before you communicate it.',
    actions: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openCycleDialog(ctx) }, 'Declare a cycle'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openBandDialog(ctx) }, 'Add a band'),
      cycle ? h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => {
          const text = buildCompBrief(ctx.state, cycle, ctx.now);
          if (!downloadText({ filename: `leados-merit-${cycle.effectiveOn || 'cycle'}.md`, text, mime: 'text/markdown' })) {
            openModal({ title: 'Copy the merit brief', body: h('textarea', { readOnly: true, rows: 20, 'aria-label': 'Merit cycle brief' }, text) });
          }
        },
      }, 'Export the brief') : null,
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const res = ctx.api.scanMerit();
          toast(res.changed ? 'Scan complete: the audit opened the work it found.' : 'Scan complete: nothing new to open.', res.changed ? 'good' : 'neutral');
          ctx.refresh();
        },
      }, 'Scan now'),
    ],
  });
}

function bandsCard(ctx, reading) {
  const bands = [...(ctx.state.compBands || [])].sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
  const currency = reading?.cycle?.currency || 'USD';
  const body = bands.length
    ? table({
      caption: 'Declared compensation bands by level and effective date',
      columns: [
        { label: 'Level', render: (row) => h('strong', null, LEVEL_LABELS[row.level] || row.level) },
        { label: 'Floor', render: (row) => money(currency, row.min) },
        { label: 'Midpoint', render: (row) => money(currency, row.mid) },
        { label: 'Ceiling', render: (row) => money(currency, row.max) },
        { label: 'Effective', render: (row) => (row.effectiveOn ? formatDate(row.effectiveOn) : '—') },
        { label: 'People in it', render: (row) => String(reading?.integrity?.levels?.find((level) => level.level === row.level)?.people ?? 0) },
        {
          label: 'Actions',
          render: (row) => h('div', { class: 'row-actions' },
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openBandDialog(ctx, row), 'aria-label': `Edit the ${row.level} band` }, 'Edit'),
            h('button', {
              class: 'btn btn-ghost btn-sm',
              type: 'button',
              'aria-label': `Delete the ${row.level} band`,
              onClick: () => {
                confirmDialog({
                  title: `Delete the ${LEVEL_LABELS[row.level] || row.level} band?`,
                  message: 'Every compa-ratio for this level stops being measurable. The pay rows are not deleted.',
                  confirmLabel: 'Delete the band',
                  danger: true,
                  onConfirm: () => {
                    const res = ctx.api.deleteCompBand(row.id);
                    if (!res.ok) toast(res.error, 'bad');
                    else toast('Band deleted.', 'neutral');
                    ctx.refresh();
                  },
                });
              },
            }, 'Delete')),
        },
      ],
      rows: bands,
    })
    : emptyState({
      title: 'No bands declared yet',
      body: 'A band is the only market structure this app holds. Without one, no compa-ratio, no positioning and no band-ceiling constraint can be computed — and the page says so instead of inventing a plausible range.',
      action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openBandDialog(ctx) }, 'Declare the first band'),
    });
  return card({
    title: 'Compensation bands',
    subtitle: 'Declared, not imported. A midpoint is a positioning convention, not a merit standard.',
    actions: [h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openBandDialog(ctx) }, 'Add band')],
    body,
  });
}

function statsRow(reading) {
  const spendTone = reading.spent > reading.budget.amount + 0.5 ? 'bad' : 'good';
  return h('div', { class: 'stat-grid' },
    stat({
      label: 'Budget',
      value: reading.budget.kind === 'pool-pct' ? `${reading.budget.value}% of payroll` : money(reading.cycle.currency, reading.budget.amount),
      hint: `${money(reading.cycle.currency, reading.budget.payroll)} payroll · ${reading.budget.pctOfPayroll ?? '—'}% of pay`,
    }),
    stat({
      label: 'Proposed',
      value: money(reading.cycle.currency, reading.spent),
      hint: `${reading.rows.length} decision(s) · ${reading.integrity.counts.withoutPay} without pay`,
      tone: spendTone,
    }),
    stat({
      label: 'Modelled departures',
      value: `${reading.expectedDepartures}`,
      hint: `Replacement exposure ${money(reading.cycle.currency, reading.replacementExposure)}`,
      tone: reading.unaddressed.length ? 'bad' : '',
    }),
    stat({
      label: 'Fairness flags',
      value: String(reading.flags.length),
      hint: reading.flags.length ? reading.flags.map((flag) => flag.id).slice(0, 3).join(' · ') : 'No flag fired',
      tone: reading.flags.some((flag) => flag.severity >= 4) ? 'warn' : '',
    }));
}

function budgetMeter(reading) {
  const used = reading.budget.amount > 0 ? Math.min(100, (reading.spent / reading.budget.amount) * 100) : 0;
  return card({
    title: 'Budget',
    subtitle: reading.budget.kind === 'pool-pct'
      ? `${reading.budget.value}% of payroll is ${money(reading.cycle.currency, reading.budget.amount)} across ${reading.rows.length} people.`
      : `${money(reading.cycle.currency, reading.budget.amount)} declared before the allocations, not after.`,
    body: h('div', { class: 'stack-sm' },
      progressBar(used / 100, { tone: used > 100 ? 'bad' : 'good', label: `${Math.round(used)}% of budget proposed` }),
      h('p', { class: 'small muted' }, used > 100
        ? `Proposals exceed the budget by ${money(reading.cycle.currency, reading.spent - reading.budget.amount)}. The cycle cannot be finalized over budget; record the overspend as its own decision.`
        : `${money(reading.cycle.currency, Math.max(0, reading.budget.amount - reading.spent))} unallocated.`)),
  });
}

function policySection(ctx, cycle, reading) {
  if (reading.policies.status !== 'ok') {
    return card({
      title: 'Policy comparison',
      subtitle: 'Three defensible ways to spend the same budget.',
      body: banner({
        tone: 'info',
        title: 'Not enough to price yet',
        body: reading.policies.reason === 'no-pay'
          ? 'Record current pay for at least one person, and declare a budget, before policies can be compared.'
          : 'Set a budget above zero in the cycle declaration.',
      }),
    });
  }
  const rows = reading.policies.policies.map((policy) => ({
    policy,
    className: policy.sameAsBest ? 'row-selected' : '',
  }));
  const body = h('div', { class: 'stack-sm' },
    table({
      caption: 'Three merit policies priced against the same budget',
      columns: [
        { label: 'Policy', render: (row) => h('div', { class: 'stack-xs' }, h('strong', null, row.policy.label), h('span', { class: 'small muted' }, short(row.policy.description, 120))) },
        { label: 'Spend', render: (row) => h('span', null, money(cycle.currency, row.policy.spend), h('span', { class: 'small muted' }, ` (${row.policy.usePct ?? '—'}%)`)) },
        { label: 'Adjustment', render: (row) => `${row.policy.meanAdjustPct ?? '—'}% mean · ${row.policy.minAdjustPct ?? '—'}–${row.policy.maxAdjustPct ?? '—'}%` },
        { label: 'Expected departures', render: (row) => `${row.policy.expectedDepartures}` },
        { label: 'Retained value', render: (row) => money(cycle.currency, row.policy.retainedValue) },
        { label: 'Regret', render: (row) => (row.policy.sameAsBest ? badge('Best on retained value', 'good') : money(cycle.currency, row.policy.regretValue)) },
        { label: 'Four-fifths', render: (row) => (row.policy.impact?.status === 'ok' ? `${row.policy.impact.ratio?.toFixed(2)}${row.policy.impact.flagged ? ' ⚠' : ''}` : '—') },
        {
          label: 'Apply',
          render: (row) => (cycle.status === 'finalized'
            ? h('span', { class: 'small muted' }, 'Frozen')
            : h('button', {
              class: 'btn btn-ghost btn-sm',
              type: 'button',
              'aria-label': `Apply the ${row.policy.label} policy`,
              onClick: () => {
                const res = ctx.api.applyMeritPolicy(cycle.id, row.policy.id);
                if (!res.ok) toast(res.error, 'bad');
                else toast(`Applied ${row.policy.label.toLowerCase()}: ${money(cycle.currency, res.policy.spend)} proposed.`, 'good');
                ctx.refresh();
              },
            }, 'Write these numbers')),
        },
      ],
      rows,
    }),
    h('p', { class: 'small muted' }, `${reading.policies.headroomNote} Retained value is replacement cost × the reduction in modelled departure probability; regret is how much retained value the policy gives up against the best option. All three are model outputs from the constants printed on the Method tab.`));
  return card({
    title: 'Policy comparison',
    subtitle: 'An equal split and a performance-weighted split have knowable consequences for who leaves. A manager who can see them decides differently.',
    body,
  });
}

function allocationSection(ctx, cycle, reading) {
  const editable = cycle.status !== 'finalized';
  const rows = [...reading.rows].sort((a, b) => (b.departureRisk ?? 0) - (a.departureRisk ?? 0) || String(a.name).localeCompare(String(b.name)));
  const exposure = new Map(reading.exposures.map((row) => [row.personId, row]));
  const tableBody = rows.length
    ? table({
      caption: 'Every pay decision in the cycle with its band position and modelled departure risk',
      columns: [
        { label: 'Person', render: (row) => h('div', { class: 'stack-xs' }, h('strong', null, row.name), h('span', { class: 'small muted' }, `${LEVEL_LABELS[row.level] || row.level || '—'} · ${COMP_ORIGIN_LABELS[row.origin]}`)) },
        { label: 'Current', render: (row) => money(cycle.currency, row.currentPay) },
        { label: 'Proposed', render: (row) => (row.proposedPay === null ? badge('No proposal', 'warn') : money(cycle.currency, row.proposedPay)) },
        { label: 'Change', render: (row) => (row.adjustPct === null ? '—' : `${row.adjustPct > 0 ? '+' : ''}${row.adjustPct}%`) },
        {
          label: 'Band position',
          render: (row) => (row.position.compaRatio === null
            ? badge('No band', 'neutral')
            : h('div', { class: 'stack-xs' },
              badge(`${row.position.compaRatio.toFixed(2)} compa · ${row.position.label}`, positionTone(row.position.position)),
              h('span', { class: 'small muted' }, row.position.penetrationPct === null ? '' : `${row.position.penetrationPct}% through the range`))),
        },
        {
          label: 'Departure risk',
          render: (row) => {
            const risk = exposure.get(row.personId);
            if (!risk || risk.departurePct === null) return '—';
            return h('div', { class: 'stack-xs' },
              badge(`${risk.departurePct}%`, risk.departurePct >= 25 ? 'bad' : risk.departurePct >= 15 ? 'warn' : 'good'),
              row.retentionConcern ? h('span', { class: 'small muted' }, 'Concern recorded') : null);
          },
        },
        { label: 'Replacement', render: (row) => money(cycle.currency, exposure.get(row.personId)?.replacementCost) },
        {
          label: 'Actions',
          render: (row) => (editable ? h('button', {
            class: 'btn btn-ghost btn-sm',
            type: 'button',
            'aria-label': `Edit the pay decision for ${row.name}`,
            onClick: () => openRowDialog(ctx, cycle, reading, row),
          }, 'Edit') : h('span', { class: 'small muted' }, 'Frozen')),
        },
      ],
      rows,
      emptyMessage: 'No pay rows yet. Add the roster, then record each current salary — nothing is estimated.',
    })
    : emptyState({
      title: 'No pay decisions yet',
      body: 'Add the active roster to create empty rows. Record current pay for each person; the app will not infer a salary from a band, a level or a colleague.',
      action: editable ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openAddPeopleDialog(ctx, cycle, reading) }, 'Add the roster') : null,
    });

  return h('div', { class: 'view-stack' },
    tableBody,
    editable && rows.length ? h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openAddPeopleDialog(ctx, cycle, reading) }, 'Add missing people')) : null,
    structureCard(reading, cycle));
}

function structureCard(reading, cycle) {
  const findings = reading.compression;
  return card({
    title: 'Relative pay inside the reporting line',
    subtitle: 'Compression and the external-hire premium. Both are market facts until nobody decided them.',
    body: findings.length
      ? h('ul', { class: 'list-plain stack-sm' },
        ...findings.map((finding) => h('li', { class: 'stack-xs' },
          badge(finding.kind === 'inversion' ? 'Compression / inversion' : 'External premium', finding.severity >= 4 ? 'bad' : 'warn'),
          h('p', null, finding.detail),
          h('p', { class: 'small muted' }, finding.advice))))
      : h('p', { class: 'small muted' }, `No finding above the ${COMP_CONVENTIONS.compressionTolerancePct}% tolerance. That is a statement about relative pay inside this cycle, not about the market.`),
  });
}

function fairnessSection(reading) {
  const d = reading.decomposition;
  const impact = reading.impact;
  const decompositionBody = d.status === 'ok'
    ? h('div', { class: 'stack-sm' },
      h('div', { class: 'stat-grid' },
        stat({ label: `Raw gap: ${d.groupA} vs ${d.groupB}`, value: pct(d.gapPct), hint: `${d.n} people with pay · ${d.nA} vs ${d.nB}` }),
        stat({ label: 'Explained', value: pct(d.explainedPct), hint: 'By level, tenure and the last completed rating' }),
        stat({
          label: 'Unexplained',
          value: pct(d.unexplainedPct),
          hint: d.interval.unexplainedPct ? `adjusted gap, 95% interval ${d.interval.unexplainedPct[0]}% to ${d.interval.unexplainedPct[1]}%` : 'Interval not available',
          tone: d.interval.unexplainedPct && Math.abs(d.interval.unexplainedPct[0]) > d.floorPct ? 'warn' : '',
        })),
      table({
        caption: 'Contribution of each control to the explained part of the gap',
        columns: [
          { label: 'Term', render: (row) => row.label },
          { label: 'Coefficient', render: (row) => row.coefficient.toFixed(4) },
          { label: 'Contribution (log points)', render: (row) => row.contribution.toFixed(4) },
        ],
        rows: d.contributions.filter((row) => row.label !== 'intercept'),
      }),
      h('p', { class: 'small muted' }, `Fit: the adjusted gap is the coefficient on the group indicator (t = ${d.adjusted?.t ?? '—'}, ${d.adjusted?.dof ?? '—'} degrees of freedom, standard error ${d.adjusted?.standardErrorLogPts ?? '—'} log points)${d.ridge ? '; ridge fallback used because the design was rank-deficient' : ''}${d.ratingMissing ? `; ${d.ratingMissing} person(s) without a completed review carried an explicit missingness term` : ''}. R² ${d.r2 ?? '—'}.`),
      ...d.caveats.map((line) => h('p', { class: 'small muted' }, `· ${line}`)))
    : banner({
      tone: 'info',
      title: 'The decomposition refuses to run',
      body: d.detail || (d.reason === 'group-too-small'
        ? `Groups need at least ${d.minGroupSize} people with pay recorded. Below that the app reports insufficiency rather than a number nobody should quote.`
        : 'Two groups with at least a few people each are needed before a decomposition says anything.'),
    });

  const impactBody = impact.status === 'ok'
    ? h('div', { class: 'stack-sm' },
      h('p', null, impact.detail),
      table({
        caption: 'Favourable-decision rate by group against the cycle median adjustment',
        columns: [
          { label: 'Group', render: (row) => row.label },
          { label: 'People', render: (row) => String(row.n) },
          { label: 'Favourable', render: (row) => `${row.favourable}/${row.n}` },
          { label: 'Rate', render: (row) => pct(row.rate * 100) },
          { label: '95% interval', render: (row) => (row.interval ? `${pct(row.interval.low * 100)} – ${pct(row.interval.high * 100)}` : '—') },
          { label: 'Mean adjustment', render: (row) => pct(row.meanAdjustPct) },
        ],
        rows: impact.groups,
      }),
      h('p', { class: 'small muted' }, `A decision counts as favourable when the proposed adjustment is at or above the cohort median of ${impact.cut}%. The four-fifths rule is a screening heuristic from employment-law practice, not a legal conclusion, and a ratio on five people is a prompt to look rather than a finding.`))
    : banner({ tone: 'info', title: 'Adverse impact not computed', body: impact.detail });

  return h('div', { class: 'view-stack' },
    card({
      title: 'Oaxaca–Blinder decomposition',
      subtitle: 'Of the observed gap, how much is explained by the characteristics the workspace records — and how much is not.',
      body: decompositionBody,
    }),
    card({
      title: 'Four-fifths screen',
      subtitle: `Threshold ${(impact.threshold ?? COMP_CONVENTIONS.adverseImpactRatio).toFixed(2)}. Applied to the raise itself, which is the decision a manager controls.`,
      body: impactBody,
    }),
    card({
      title: 'What this audit cannot tell you',
      subtitle: 'Read before quoting any figure above.',
      body: h('ul', { class: 'list-plain stack-xs' },
        h('li', null, 'This app deliberately stores no protected characteristic. It audits a comparison you declare — how people joined, or which sub-team they are in — and those are proxies for a question it cannot ask.'),
        h('li', null, 'An unexplained gap is not proof of discrimination. Omitted variables (scope, negotiation history, market timing) sit inside it.'),
        h('li', null, 'The four-fifths rule is a screening heuristic. It is not a legal test and it is not a finding of wrongdoing.'),
        h('li', null, 'A decomposition describes this team on this date. It does not estimate what anyone should be paid.')),
    }));
}

function retentionSection(reading) {
  const exposures = [...reading.exposures].sort((a, b) => (b.departurePct ?? 0) - (a.departurePct ?? 0));
  return card({
    title: 'Retention exposure',
    subtitle: 'A printed model, not a black box: four terms, each one you can disagree with.',
    body: h('div', { class: 'stack-sm' },
      table({
        caption: 'Modelled departure probability and replacement cost per person',
        columns: [
          { label: 'Person', render: (row) => row.name },
          { label: 'Departure', render: (row) => (row.departurePct === null ? '—' : badge(`${row.departurePct}%`, row.departurePct >= 25 ? 'bad' : row.departurePct >= 15 ? 'warn' : 'good')) },
          { label: 'Compa deficit', render: (row) => (row.terms ? `${row.terms.deficitPp} pp` : '—') },
          { label: 'Peer deficit', render: (row) => (row.terms ? `${row.terms.peerDeficitPp} pp` : '—') },
          { label: 'Recorded concern', render: (row) => (row.terms?.concern ? 'Yes' : 'No') },
          { label: 'Replacement cost', render: (row) => money(reading.cycle.currency, row.replacementCost) },
          { label: 'Succession basis', render: (row) => h('span', { class: 'small muted' }, row.criticalityBasis) },
        ],
        rows: exposures,
      }),
      h('p', { class: 'small muted' }, `p(depart) = logistic(${COMP_CONVENTIONS.riskBase} + ${COMP_CONVENTIONS.riskPerDeficitPp}×compa-deficit-pp + ${COMP_CONVENTIONS.riskPerPeerDeficitPp}×peer-deficit-pp + ${COMP_CONVENTIONS.riskPerRecordedConcern}×recorded-concern), clamped to ${COMP_CONVENTIONS.riskFloorPct}–${COMP_CONVENTIONS.riskCeilingPct}%. Replacement cost reads the succession bench: an empty bench multiplies it by ${COMP_CONVENTIONS.criticalityEmptyBench}, a ready successor by ${COMP_CONVENTIONS.criticalityCoveredBench}. The coefficients are conventions; the Calibration tab is where they are graded.`),
      reading.unaddressed.length
        ? banner({
          tone: 'warn',
          title: `${reading.unaddressed.length} high-risk person(s) with no proposed increase`,
          body: reading.unaddressed.map((row) => `${row.name} (${row.departurePct}%)`).join(', '),
        })
        : null),
  });
}

function auditSection(ctx, reading, cycle) {
  const audit = cycle.audit;
  if (!audit) {
    return card({
      title: 'Frozen audit',
      subtitle: 'Finalizing freezes today’s reading so a later record cannot rewrite what you decided.',
      body: h('p', { class: 'small' }, 'Not finalized yet. On finalization the app freezes the band integrity, the decomposition, the four-fifths screen, the relative-pay findings and the departure predictions in one transaction — and the rules open a dated outcome review from them.'),
    });
  }
  return card({
    title: `Frozen audit · ${audit.on ? formatDate(audit.on) : 'undated'}`,
    subtitle: `Status: ${audit.status}. This reading is preserved exactly; it is not recomputed from today's records.`,
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Committed', value: money(reading.cycle.currency, audit.spent), hint: `of ${money(reading.cycle.currency, audit.budget.amount)} budget` }),
        stat({ label: 'Rows', value: String(audit.rowCount), hint: `${audit.integrity.withoutPay} without pay · ${audit.integrity.noBand} without a band` }),
        stat({ label: 'Expected departures', value: String(audit.expectedDepartures ?? '—'), hint: `Replacement exposure ${money(reading.cycle.currency, audit.replacementExposure)}` }),
        stat({ label: 'Findings', value: String(audit.compression.inversion + audit.compression.loyaltyPenalty), hint: `${audit.compression.inversion} inversion · ${audit.compression.loyaltyPenalty} external premium` })),
      h('ul', { class: 'list-plain stack-xs' },
        h('li', null, audit.decomposition?.status === 'ok'
          ? `Gap ${audit.decomposition.gapPct}% · explained ${audit.decomposition.explainedPct}% · unexplained ${audit.decomposition.unexplainedPct}%${audit.decomposition.intervalPct ? ` (interval ${audit.decomposition.intervalPct[0]}% to ${audit.decomposition.intervalPct[1]}%)` : ''}`
          : 'Decomposition was insufficient at finalization and is recorded as such.'),
        h('li', null, audit.impact?.status === 'ok'
          ? `Four-fifths ratio ${audit.impact.ratio?.toFixed(2)} against ${audit.impact.threshold?.toFixed(2)}${audit.impact.flagged ? ' — flagged' : ''}`
          : 'Adverse-impact screen was not computable at finalization.'),
        h('li', null, `${audit.predictions.length} departure prediction(s) frozen. The model grades itself on the Calibration tab as outcomes resolve.`),
        ...audit.flags.map((flag) => h('li', { class: 'small muted' }, `${flag.id} (severity ${flag.severity}): ${flag.detail}`))),
      cycle.status === 'finalized'
        ? h('div', { class: 'row-actions' },
          h('button', {
            class: 'btn btn-ghost btn-sm',
            type: 'button',
            onClick: () => {
              const res = ctx.api.reopenMeritCycle(cycle.id);
              if (!res.ok) {
                toast(res.error, 'bad');
                return;
              }
              toast('Cycle reopened. The frozen audit stays until the next finalization supersedes it.', 'neutral');
              ctx.refresh();
            },
          }, 'Reopen the cycle'))
        : null),
  });
}

function calibrationSection(ctx) {
  const calibration = retentionCalibration(ctx.state, ctx.now);
  if (calibration.status !== 'ok') {
    return card({
      title: 'Does the retention model work?',
      subtitle: 'It grades itself out of sample, and refuses to claim skill below five resolved outcomes.',
      body: banner({
        tone: 'info',
        title: 'Not enough resolved outcomes yet',
        body: calibration.detail,
      }),
    });
  }
  return card({
    title: 'Does the retention model work?',
    subtitle: 'The predictions were frozen before anyone left. That is what makes this a test rather than a memory.',
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Brier score', value: String(calibration.brier), hint: `Base-rate comparator ${calibration.baseBrier}` }),
        stat({ label: 'Skill', value: calibration.skill === null ? '—' : `${Math.round(calibration.skill * 100)}%`, hint: calibration.skill > 0 ? 'Beats the base rate' : 'No better than always guessing the base rate', tone: calibration.skill > 0 ? 'good' : 'warn' }),
        stat({ label: 'Resolved predictions', value: String(calibration.n), hint: `${calibration.departed} departure(s) · base rate ${calibration.baseRatePct}%` })),
      table({
        caption: 'Predicted versus observed departure rate by prediction bucket',
        columns: [
          { label: 'Bucket', render: (row) => row.label },
          { label: 'People', render: (row) => String(row.n) },
          { label: 'Predicted', render: (row) => pct(row.predicted) },
          { label: 'Observed', render: (row) => pct(row.observed) },
        ],
        rows: calibration.buckets,
      }),
      h('p', { class: 'small muted' }, calibration.detail),
      h('p', { class: 'small muted' }, 'A departure is recorded from the roster: archiving a person inside the prediction window resolves their prediction as departed, and a window that closes with the person still in place resolves it as stayed. Nothing is recomputed after the fact.')),
  });
}

function methodSection(reading) {
  const items = [
    ['Oaxaca–Blinder (1973) twofold decomposition.', 'Log pay is regressed on level, tenure and the last completed rating. The gap is split into the part explained by those controls and the remainder. The interval on the adjusted gap is the standard error of a group indicator in the same fit, multiplied by a small-sample t; at team size a percentile bootstrap mostly measures which level a resample happened to leave out.'],
    ['Four-fifths rule (EEOC Uniform Guidelines).', `A favourable-decision rate ratio below ${COMP_CONVENTIONS.adverseImpactRatio.toFixed(2)} triggers a screen. It is a heuristic, not a legal test.`],
    ['Wilson score interval.', 'Used for each group’s favourable-decision rate, because a normal approximation on five people is worse than useless.'],
    ['Logistic hazard, printed coefficients.', `p(depart) = logistic(${COMP_CONVENTIONS.riskBase} + ${COMP_CONVENTIONS.riskPerDeficitPp}·deficit + ${COMP_CONVENTIONS.riskPerPeerDeficitPp}·peer-deficit + ${COMP_CONVENTIONS.riskPerRecordedConcern}·concern). Not fitted to this workspace — which is exactly why the calibration tab exists.`],
    ['Diminishing marginal returns.', 'Because the hazard is logistic, each additional point of compa-ratio buys less. The retention policy is a greedy water-filling allocation by marginal expected retained value per unit of budget, with the band ceiling and the adjustment ceiling respected.'],
    ['Replacement cost.', `Annual pay × the multiplier in Settings (default ${COMP_CONVENTIONS.replacementMultiplier}×, a deliberately conservative point inside the widely cited 50–200% range) × a succession factor read from the readiness ledger.`],
    ['Regret.', 'The value the chosen policy gives up against the best of the three priced policies. Regret is computed on the model, not on the future.'],
    ['Refusals.', `Below ${COMP_CONVENTIONS.minGroupSize} people per group the decomposition returns insufficient. Below ${COMP_CONVENTIONS.minOutcomesForCalibration} resolved outcomes the calibration makes no skill claim. Neither is replaced by a number.`],
  ];
  return card({
    title: 'What this model is, and what it is not',
    subtitle: 'Every constant is printed so a reader can disagree with it explicitly rather than silently.',
    body: h('div', { class: 'stack-sm' },
      h('ul', { class: 'list-plain stack-xs' },
        ...items.map(([label, text]) => h('li', null, h('strong', null, label), ' ', text))),
      h('p', { class: 'small muted' }, 'This page contains no market survey, no salary benchmark feed and no external data. Every number is derived from what you entered, and the tool says so on every surface where a number appears.')),
  });
}

/* ------------------------------------------------------------------ page */

export function renderMerit(ctx) {
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now);
  const cycles = (ctx.state.meritCycles || []);
  const requestedCycle = ctx.query?.get?.('cycle') || '';
  // Default to the cycle that still has work in it. Landing on a frozen audit
  // when a draft cycle exists would make the page look like a report rather than
  // a decision surface.
  const fallback = cycles.find((row) => row.status === 'draft')
    || [...cycles].sort((a, b) => String(b.effectiveOn).localeCompare(String(a.effectiveOn)))[0]
    || null;
  const cycle = cycles.find((row) => row.id === requestedCycle) || fallback;
  const requestedTab = ctx.query?.get?.('panel') || 'allocation';
  const tab = ['allocation', 'fairness', 'retention', 'calibration', 'method'].includes(requestedTab)
    ? requestedTab
    : requestedTab === 'structure' || requestedTab === 'policies' ? 'allocation' : 'allocation';

  const reading = cycle ? fairnessReading(ctx.state, cycle, now) : null;
  const bands = ctx.state.compBands || [];

  const cyclePicker = cycles.length > 1
    ? h('div', { class: 'stack-xs' },
      h('label', { for: 'merit-cycle-select' }, 'Cycle'),
      h('select', {
        id: 'merit-cycle-select',
        onChange: (event) => ctx.navigate(`#/merit?cycle=${encodeURIComponent(event.target.value)}`),
      },
      ...cycles.map((row) => h('option', { value: row.id, ...(row.id === cycle.id ? { selected: 'selected' } : {}) },
        `${row.label} · ${COMP_STATUS_LABELS[row.status] || row.status}`))))
    : null;

  const cycleBody = () => {
    if (!cycle) {
      return emptyState({
        title: 'No merit cycle yet',
        body: 'Declare a cycle with a budget and a comparison dimension. The budget is captured before the allocations so the page can tell you what the money bought, rather than what it cost.',
        action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openCycleDialog(ctx) }, 'Declare a cycle'),
      });
    }
    return h('div', { class: 'view-stack' },
      banner({
        tone: cycle.status === 'finalized' ? 'good' : reading.flags.some((flag) => flag.severity >= 4) ? 'bad' : reading.flags.length ? 'warn' : 'info',
        title: cycle.status === 'finalized'
          ? `“${cycle.label}” is finalized — the audit below is frozen`
          : reading.flags.length
            ? `${reading.flags.length} finding(s) before this cycle can be communicated`
            : `“${cycle.label}” is inside its budget with no structural finding`,
        body: cycle.status === 'finalized'
          ? 'The predictions are frozen and the outcome review is scheduled. Reopening the cycle does not rewrite the frozen audit; it is superseded only by a new finalization.'
          : 'Bands, budget and comparison are declared; the allocations are still editable. Finalizing freezes the reading in the same transaction as the status change.',
        actions: cycle.status !== 'finalized'
          ? [
            h('button', {
              class: 'btn btn-primary btn-sm',
              type: 'button',
              onClick: () => {
                confirmDialog({
                  title: `Finalize “${cycle.label}”?`,
                  message: 'This freezes the band integrity, the decomposition, the four-fifths screen, the relative-pay findings and every departure prediction. The rules will open a mechanism decision if the audit is flagged, and a dated outcome review either way.',
                  confirmLabel: 'Finalize the cycle',
                  onConfirm: () => {
                    const res = ctx.api.finalizeMeritCycle(cycle.id);
                    if (!res.ok) toast(res.error, 'bad');
                    else toast('Cycle finalized. The audit is frozen and the follow-up work is open.', 'good');
                    ctx.refresh();
                  },
                });
              },
            }, 'Finalize the cycle'),
            h('button', {
              class: 'btn btn-ghost btn-sm',
              type: 'button',
              onClick: () => {
                confirmDialog({
                  title: `Abandon “${cycle.label}”?`,
                  message: 'The rows and any frozen audit stay readable as history. Abandoned cycles are excluded from the scan and from the badge count.',
                  confirmLabel: 'Abandon',
                  danger: true,
                  onConfirm: () => {
                    const res = ctx.api.abandonMeritCycle(cycle.id);
                    if (!res.ok) toast(res.error, 'bad');
                    else toast('Cycle abandoned.', 'neutral');
                    ctx.refresh();
                  },
                });
              },
            }, 'Abandon'),
          ]
          : [
            h('button', {
              class: 'btn btn-ghost btn-sm',
              type: 'button',
              onClick: () => {
                const res = ctx.api.reopenMeritCycle(cycle.id);
                if (!res.ok) toast(res.error, 'bad');
                else toast('Reopened. The frozen audit is kept until the next finalization supersedes it.', 'neutral');
                ctx.refresh();
              },
            }, 'Reopen'),
          ],
      }),
      statsRow(reading),
      h('div', { class: 'grid-2' }, budgetMeter(reading), card({
        title: 'The comparison',
        subtitle: COMP_DIMENSION_LABELS[cycle.comparison?.dimension] || 'Hire origin',
        body: h('div', { class: 'stack-sm' },
          kv('Status', COMP_STATUS_LABELS[cycle.status] || cycle.status),
          kv('Effective', cycle.effectiveOn ? formatDate(cycle.effectiveOn) : '—'),
          kv('Currency', cycle.currency),
          kv('Owner', (ctx.state.people || []).find((person) => person.id === cycle.ownerId)?.name || 'Not assigned'),
          cycle.status !== 'finalized'
            ? h('div', { class: 'stack-xs' },
              h('label', { for: 'merit-dimension' }, 'Change the comparison'),
              h('select', {
                id: 'merit-dimension',
                onChange: (event) => {
                  const res = ctx.api.updateMeritCycle(cycle.id, { comparisonDimension: event.target.value });
                  if (!res.ok) toast(res.error, 'bad');
                  else toast('Comparison changed; the audit is re-derived.', 'good');
                  ctx.refresh();
                },
              },
              ...COMP_DIMENSIONS.map((key) => h('option', { value: key, ...(cycle.comparison?.dimension === key ? { selected: 'selected' } : {}) }, COMP_DIMENSION_LABELS[key]))))
            : null),
      })),
      tabs({
        items: [
          { key: 'allocation', label: 'Allocation', count: reading.rows.length },
          { key: 'fairness', label: 'Fairness audit', count: reading.flags.filter((flag) => ['adverse-impact', 'unexplained-gap'].includes(flag.id)).length },
          { key: 'retention', label: 'Retention', count: reading.unaddressed.length },
          { key: 'calibration', label: 'Calibration' },
          { key: 'method', label: 'Method' },
        ],
        active: tab,
        onSelect: (key) => ctx.navigate(`#/merit?cycle=${encodeURIComponent(cycle.id)}&panel=${encodeURIComponent(key)}`),
        ariaLabel: 'Merit cycle sections',
      }),
      tab === 'allocation'
        ? h('div', { class: 'view-stack' }, policySection(ctx, cycle, reading), allocationSection(ctx, cycle, reading))
        : null,
      tab === 'fairness' ? fairnessSection(reading) : null,
      tab === 'retention' ? retentionSection(reading) : null,
      tab === 'calibration' ? calibrationSection(ctx) : null,
      tab === 'method' ? methodSection(reading) : null,
      auditSection(ctx, reading, cycle));
  };

  return h('div', { class: 'page', 'data-testid': 'merit-page' },
    header(ctx, cycle),
    cyclePicker,
    bands.length
      ? null
      : banner({
        tone: 'warn',
        title: 'No compensation bands declared',
        body: 'Without bands there is no compa-ratio, no positioning, no band ceiling and no integrity check. The page will measure nothing and say so — it will not invent a range.',
        actions: [h('button', { class: 'btn btn-primary btn-sm', type: 'button', onClick: () => openBandDialog(ctx) }, 'Declare a band')],
      }),
    cycleBody(),
    bandsCard(ctx, reading));
}
