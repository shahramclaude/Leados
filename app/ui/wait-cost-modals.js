/**
 * app/ui/wait-cost-modals.js — the two dialogs of the Cost of Waiting
 * terminal (Schema v64).
 *
 *   openDeclarePriceDialog     declare the weekly delay price of a class of
 *                              work — the one input the engine cannot derive —
 *                              with a live preview of what the price will do to
 *                              this week's exposure
 *   openFreezeExposureDialog   freeze this week's exposure certificate
 *                              explicitly, with a review date
 *
 * The declare-price dialog previews the effect before committing, because a
 * declared price fires a scan: certificate, typed edges, owned tasks and a
 * triage decision all update in the same write.
 */

import { h, toast, openModal } from './dom.js';
import { addDays, dayKey } from '../core/time.js';
import {
  WAIT_CLASS_KEYS,
  activeWaitPrice,
  classLabel,
  waitConventionsFromSettings,
  waitCostReport,
} from '../core/domain/waitCost.js';

function field(id, label, control, hint = null) {
  return h('div', { class: 'stack-xs' },
    h('label', { for: id }, label),
    control,
    hint ? h('span', { class: 'muted small' }, hint) : null);
}

function money(amount, currency) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '—';
  return `${currency} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function openDeclarePriceDialog(ctx) {
  const conventions = waitConventionsFromSettings(ctx.state.settings || {});
  const classSelect = h('select', { id: 'wait-class' },
    ...WAIT_CLASS_KEYS.map((key) => {
      const active = activeWaitPrice(ctx.state, key);
      return h('option', { value: key }, `${classLabel(key)}${active ? ` — currently ${money(active.weeklyAmount, active.currency)}/week` : ' — unpriced'}`);
    }));
  const amount = h('input', {
    id: 'wait-amount',
    type: 'number',
    min: '0',
    max: '1000000000000',
    step: '0.01',
    value: '0',
  });
  const currency = h('input', {
    id: 'wait-currency',
    type: 'text',
    maxlength: '3',
    value: 'USD',
    'aria-label': 'Currency code, three letters',
  });
  const note = h('input', {
    id: 'wait-note',
    type: 'text',
    maxlength: '200',
    placeholder: 'Why this number (optional)',
  });
  const preview = h('div', { class: 'stack-xs' });

  function renderPreview() {
    const classKey = classSelect.value;
    const value = Number(amount.value);
    const currencyRaw = String(currency.value || '').trim().toUpperCase();
    const cur = /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : 'USD';
    const report = waitCostReport(ctx.state, ctx.now, ctx.state.settings || {});
    const rows = report.rows.filter((row) => row.item.kind === classKey);
    const openCount = rows.length;
    const overdue = rows.filter((row) => row.overdue).length;
    preview.replaceChildren();
    if (!Number.isFinite(value) || value < 0) {
      preview.appendChild(h('p', { class: 'muted' }, 'Enter a non-negative weekly amount.'));
      return;
    }
    preview.appendChild(h('p', { class: 'muted' },
      `${classLabel(classKey)}: ${openCount} open item(s), ${overdue} past the class median. Declaring ${money(value, cur)}/week adds `,
      h('strong', null, money(value * overdue, cur)),
      ` to the overdue weekly exposure this week${value > 0 && overdue > 0 ? ' — above the triage threshold, so a scan would open one triage decision in ' + cur : ''}. Declaring the price fires a scan in the same write.`));
  }

  for (const control of [classSelect, amount, currency]) control.addEventListener('input', renderPreview);
  renderPreview();

  const dialog = openModal({
    title: 'Declare a weekly delay price',
    description: 'What does one open week of this class of work cost? This is the one number the app cannot derive — unpriced is reported as unknown, never as zero.',
    body: h('div', { class: 'stack' },
      field('wait-class', 'Class of work', classSelect, 'The same six classes the Delivery Survival terminal harvests.'),
      field('wait-amount', 'Weekly amount', amount, 'Per open week. 0 records that the wait is accepted unpriced.'),
      field('wait-currency', 'Currency (3 letters)', currency, 'Aggregates are per currency and never pooled across units.'),
      field('wait-note', 'Why this number', note),
      preview),
    footer: [
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.declareWaitPrice({
            classKey: classSelect.value,
            weeklyAmount: amount.value,
            currency: currency.value,
            note: note.value,
          });
          if (result && result.ok) {
            dialog.close();
            toast(`Declared ${result.active.currency} ${result.active.weeklyAmount}/week for ${classLabel(result.active.classKey)} — the scan has already cascaded it.`, 'good');
            ctx.navigate('#/wait?panel=prices');
          } else {
            toast((result && result.error) || 'Could not declare the price.', 'bad');
          }
        },
      }, 'Declare the price'),
    ],
  });
}

export function openFreezeExposureDialog(ctx) {
  const report = waitCostReport(ctx.state, ctx.now, ctx.state.settings || {});
  const today = dayKey(ctx.now);
  const label = h('input', {
    id: 'wait-label',
    type: 'text',
    maxlength: '200',
    value: `Exposure certificate, week of ${report.week}`,
  });
  const reviewOn = h('input', {
    id: 'wait-review',
    type: 'date',
    value: addDays(today, 7),
  });
  const preview = h('div', { class: 'stack-xs' });
  function renderPreview() {
    preview.replaceChildren();
    if (!report.counts.open) {
      preview.appendChild(h('p', { class: 'muted' },
        'No open dated work exists, so there is nothing to price and the freeze will be refused. A certificate over an empty queue is a receipt for a page view, not a record.'));
      return;
    }
    const priced = report.rows.filter((row) => row.price.priced);
    preview.appendChild(h('p', { class: 'muted' },
      `The certificate would freeze ${priced.length} priced item(s) across ${report.totals.length} currency bucket(s): `,
      ...report.totals.map((bucket, i) => h('span', null,
        `${i ? ' · ' : ''}${money(bucket.weeklyExposure, bucket.currency)}/week (${bucket.currency}, ${bucket.overduePricedItems} overdue)`)),
      '. It is append-only audit history — it records what the waiting was priced at; it is never edited after the freeze.'));
  }
  renderPreview();

  const dialog = openModal({
    title: 'Freeze this week’s exposure certificate',
    description: 'One certificate per week is also frozen automatically by a scan. Freezing explicitly records the priced queue now, with a review date.',
    body: h('div', { class: 'stack' },
      field('wait-label', 'What is this certificate called?', label),
      field('wait-review', 'Review date', reviewOn, 'Must be a future calendar date.'),
      preview),
    footer: [
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.freezeWaitExposure({
            label: label.value,
            reviewOn: reviewOn.value,
          });
          if (result && result.ok) {
            dialog.close();
            toast('Exposure certificate frozen. Priced overdue items are linked to it by typed edges.', 'good');
            ctx.navigate(`#/wait?panel=certificates&exposure=${encodeURIComponent(result.id)}`);
          } else {
            toast((result && result.error) || 'Could not freeze the certificate.', 'bad');
          }
        },
      }, 'Freeze it'),
    ],
  });
}
