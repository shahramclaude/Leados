/**
 * app/ui/signal-modals.js — the dialogs of the Signal Path terminal (Schema v59).
 *
 * Five dialogs, each changing exactly one kind of thing:
 *
 *   - `openSignalClassDialog` declares the event class: where it starts, what it
 *     would cost and how likely it is. Everything else on the page is derived.
 *   - `openSignalCommitDialog` shows the full reading — every hop, its lag, the
 *     reach, the bits and the expected loss — BEFORE the prediction is frozen,
 *     because a number you cannot check is a number you should not commit to.
 *   - `openSignalProbeDialog` opens a probe: a fact that already existed, with
 *     the declared reach frozen beside it.
 *   - `openSignalSettleDialog` records how the leader actually came to know,
 *     which is the only observation the module ever gets.
 *   - `openSignalLeverDialog` prices one intervention against the same evaluator
 *     the page used, then adopts it with a named owner.
 *
 * Every dialog is keyboard-operable and every control has a bound label.
 */

import { h, openModal, toast, buildForm } from './dom.js';
import {
  SIGNAL_LEARNED_VIA,
  SIGNAL_LEARNED_VIA_LABELS,
  buildSignalReport,
  conventionsFromSettings,
  priceLevers,
  readClass,
} from '../core/domain/signalPath.js';
import { addDays, dayKey, formatDate } from '../core/time.js';

function money(value, currency) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const code = String(currency || '').trim().toUpperCase();
  return `${code ? `${code} ` : ''}${Math.round(Number(value)).toLocaleString('en-US')}`;
}

function pct(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Math.round(Number(value) * 100)}%`;
}

function activePeople(state) {
  return (state.people || []).filter((person) => person && person.status !== 'archived');
}

function personOptions(state) {
  return activePeople(state).map((person) => ({
    value: person.id,
    label: `${person.name}${person.role ? ` · ${person.role}` : ''}`,
  }));
}

function submit(modalForm, handle) {
  const values = modalForm.getValues();
  const result = handle(values);
  if (!result || result.ok) return;
  if (result.field) modalForm.setFieldError(result.field, result.error);
  else toast(result.error || 'That did not work.', 'bad');
}

/* --------------------------------------------------------- class dialog */

export function openSignalClassDialog(ctx, existing = null) {
  const people = activePeople(ctx.state.people);
  if (!people.length) {
    toast('Add the people you lead first. A channel with no people on it has no path to measure.', 'bad');
    ctx.navigate('#/people');
    return;
  }
  const isEdit = Boolean(existing);
  const form = buildForm([
    {
      name: 'label',
      type: 'text',
      label: 'What kind of event is this?',
      required: true,
      wide: true,
      value: existing?.label || '',
      placeholder: 'A delivery slip on the platform team',
      help: 'One class, not a category. “Risk” cannot be priced; “a delivery slip on the platform team” can.',
    },
    {
      name: 'pathPersonId',
      type: 'select',
      label: 'Where would it start?',
      required: true,
      value: existing?.pathPersonId || people[0].id,
      options: personOptions(ctx.state),
      help: 'The deepest person who would know first. The channel is measured from them up to you.',
    },
    {
      name: 'ownerId',
      type: 'select',
      label: 'Who owns this channel?',
      value: existing?.ownerId || '',
      options: [{ value: '', label: 'Nobody yet' }, ...personOptions(ctx.state)],
      help: 'A contradicted declaration with no owner opens a decision and no task. That is by design.',
    },
    {
      name: 'currency',
      type: 'text',
      label: 'Currency',
      value: existing?.currency || 'USD',
      help: 'Currencies are never summed.',
    },
    {
      name: 'exposure',
      type: 'number',
      label: 'Exposure if it lands unmitigated',
      min: '0',
      step: '100',
      value: existing?.exposure ?? '',
      help: 'Leave it blank if you have no number. A blank is honest; a zero is a claim.',
    },
    {
      name: 'probabilityPct',
      type: 'number',
      label: 'Chance of at least one in the horizon (%)',
      min: '0',
      max: '100',
      value: existing?.probabilityPct ?? 40,
      help: 'A stated prior, and the page will say so. The Information Value terminal can price it if you would rather not guess.',
    },
    {
      name: 'horizonDays',
      type: 'number',
      label: 'Horizon (days)',
      min: '1',
      max: '730',
      value: existing?.horizonDays ?? 90,
    },
    {
      name: 'reviewOn',
      type: 'date',
      label: 'Review the channel on',
      value: existing?.reviewOn || dayKey(addDays(ctx.now, ctx.state.settings.sigReviewHorizonDays || 90)),
    },
    {
      name: 'note',
      type: 'textarea',
      rows: 2,
      label: 'Why this class',
      wide: true,
      value: existing?.note || '',
    },
  ]);

  openModal({
    title: isEdit ? 'Edit signal class' : 'Declare a signal class',
    description: 'A class is a kind of event, where it would start, and what it would cost. Committing it freezes a prediction.',
    size: 'lg',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => ctx.refresh() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => submit(form, (values) => {
          const payload = {
            label: values.label,
            pathPersonId: values.pathPersonId,
            ownerId: values.ownerId,
            currency: values.currency,
            exposure: values.exposure,
            probabilityPct: values.probabilityPct,
            horizonDays: values.horizonDays,
            reviewOn: values.reviewOn,
            note: values.note,
          };
          const result = isEdit ? ctx.api.updateSignalClass(existing.id, payload) : ctx.api.addSignalClass(payload);
          if (result.ok) {
            ctx.refresh();
            toast(isEdit ? 'Signal class updated.' : 'Declared. Commit it to freeze the channel reading.', 'good');
          }
          return result;
        }),
      }, isEdit ? 'Save' : 'Declare'),
    ],
  });
}

/* -------------------------------------------------------- commit dialog */

export function openSignalCommitDialog(ctx, klass) {
  const conventions = conventionsFromSettings(ctx.state.settings);
  const report = buildSignalReport(ctx.state, ctx.now);
  const reading = report.classes.find((row) => row.id === klass.id);
  if (!reading) {
    toast('That class could not be read. Reload and try again.', 'bad');
    return;
  }
  if (reading.blockedReason) {
    toast(reading.blockedReason, 'bad');
    return;
  }
  const r = reading.reading;
  const body = h('div', { class: 'stack' },
    h('p', null,
      'Committing freezes these six numbers as the prediction every probe will be graded against. '
      + 'You can retire the class and declare a new one later; you cannot edit this reading after the fact — that is the point of it.'),
    h('div', { class: 'kv-grid' },
      h('div', null, h('span', { class: 'muted' }, 'Declared reach'), h('div', null, pct(r.reach))),
      h('div', null, h('span', { class: 'muted' }, 'False alarms'), h('div', null, pct(r.falseAlarm))),
      h('div', null, h('span', { class: 'muted' }, 'Lag if it arrives'), h('div', null, `${r.latencyDays} d`)),
      h('div', null, h('span', { class: 'muted' }, 'Information'), h('div', null, `${r.carriedBits.toFixed(2)} of ${r.sourceBits.toFixed(2)} bits`)),
      h('div', null, h('span', { class: 'muted' }, 'Exposure'), h('div', null, r.exposure === null ? 'not declared' : money(r.exposure, reading.currency))),
      h('div', null, h('span', { class: 'muted' }, 'Expected loss'), h('div', null, r.expectedLoss === null ? 'not priced' : money(r.expectedLoss, reading.currency)))),
    h('div', { class: 'table-wrap' },
      h('table', { class: 'table', 'aria-label': 'Each relay on the declared path with its transmit probability and lag' },
        h('caption', { class: 'sr-only' }, 'Each relay on the declared path with its transmit probability and lag'),
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Relay'),
          h('th', { scope: 'col' }, 'Depth'),
          h('th', { scope: 'col' }, 'Forwards'),
          h('th', { scope: 'col' }, 'Wait'),
          h('th', { scope: 'col' }, 'Where the wait comes from'))),
        h('tbody', null, ...reading.hops.map((hop, index) => h('tr', null,
          h('td', null, hop.name),
          h('td', null, String(index + 1)),
          h('td', null, pct(hop.transmit)),
          h('td', null, `${hop.lagDays} d`),
          h('td', null, h('span', { class: 'muted small' }, hop.lagBasis))))))),
    h('p', { class: 'muted small' }, r.lossBasis),
    h('p', { class: 'muted small' },
      `Per-hop conventions: ${Math.round(conventions.transmit * 100)}% forwards, ${Math.round(conventions.falseAlarm * 100)}% false alarm, `
      + `${conventions.relayLagDays} d relay lag. All three change in Settings; they are declarations, not measurements.`));

  openModal({
    title: `Commit “${reading.label}”`,
    description: 'The prediction that every probe will be graded against',
    size: 'lg',
    body,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => ctx.refresh() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.commitSignalClass(klass.id);
          if (!result.ok) {
            toast(result.error, 'bad');
            return;
          }
          ctx.refresh();
          toast(`Committed. Reach ${pct(result.reading.reach)} is now a claim you can be wrong about.`, 'good');
        },
      }, 'Commit and freeze'),
    ],
  });
}

/* --------------------------------------------------------- probe dialog */

export function openSignalProbeDialog(ctx, klass) {
  const today = dayKey(ctx.now);
  const form = buildForm([
    {
      name: 'label',
      type: 'text',
      label: 'What do you already know?',
      required: true,
      wide: true,
      value: '',
      placeholder: 'The vendor missed the Tuesday cutover',
      help: 'You must already know it — that is what makes the probe answerable. The question is whether the chain would have told you.',
    },
    {
      name: 'truth',
      type: 'select',
      label: 'Did something actually happen?',
      value: 'event',
      options: [
        { value: 'event', label: 'Yes — a material event existed' },
        { value: 'none', label: 'No — nothing happened, and I heard nothing' },
      ],
      help: 'Quiet probes measure the false-alarm rate. Without them the false-alarm figure is unknown, not zero.',
    },
    {
      name: 'existsSinceOn',
      type: 'date',
      label: 'The day it became true',
      required: true,
      value: today,
      help: 'The day the fact first existed down in the organisation — not the day you found out.',
    },
    {
      name: 'note',
      type: 'textarea',
      rows: 2,
      label: 'Context',
      wide: true,
      value: '',
    },
  ]);

  openModal({
    title: `Open a probe on “${klass.label}”`,
    description: 'A question about the channel, not surveillance of the people on it',
    size: 'md',
    body: h('div', { class: 'stack' },
      h('p', null,
        'A probe is a fact that already exists at the bottom of the chain, recorded with the day it became true. '
        + 'Later you record how you came to know it. Nothing about a person is collected, and no message is read: the only data is what you write here.'),
      form.node),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => ctx.refresh() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => submit(form, (values) => {
          const result = ctx.api.addSignalProbe(klass.id, values);
          if (result.ok) {
            ctx.refresh();
            toast('Probe opened with the declared reach frozen beside it.', 'good');
          }
          return result;
        }),
      }, 'Open probe'),
    ],
  });
}

/* -------------------------------------------------------- settle dialog */

export function openSignalSettleDialog(ctx, probe) {
  const form = buildForm([
    {
      name: 'learnedVia',
      type: 'select',
      label: 'How did you come to know?',
      required: true,
      value: 'escalation',
      options: SIGNAL_LEARNED_VIA.map((value) => ({ value, label: SIGNAL_LEARNED_VIA_LABELS[value] })),
      help: 'Only “through the chain” counts as the channel delivering it. A skip-level or a monitor is a different channel — that finding is the point.',
    },
    {
      name: 'learnedOn',
      type: 'date',
      label: 'The day you learned it',
      value: dayKey(ctx.now),
      help: 'Leave the default for today. Ignored when you still do not know.',
    },
    {
      name: 'note',
      type: 'textarea',
      rows: 2,
      label: 'Note',
      wide: true,
      value: '',
    },
  ]);

  openModal({
    title: 'Settle the probe',
    description: probe.prediction
      ? `The declared reach frozen when this probe opened was ${pct(probe.prediction.reach)}`
      : 'The declared reach was not recorded when this probe opened',
    size: 'md',
    body: h('div', { class: 'stack' },
      h('p', null, h('strong', null, probe.label)),
      h('p', { class: 'muted small' },
        `The fact existed from ${formatDate(probe.existsSinceOn)}. ${probe.truth === 'none' ? 'This was a quiet probe: nothing happened, so any alert you received is a false alarm.' : ''}`),
      form.node),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => ctx.refresh() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => submit(form, (values) => {
          const result = ctx.api.settleSignalProbe(probe.id, values);
          if (result.ok) {
            ctx.refresh();
            toast(
              result.delivered
                ? `Recorded. The chain delivered it${result.latencyDays === null ? '' : ` after ${result.latencyDays} day(s)`}.`
                : 'Recorded. The chain did not deliver it — that is a data point, not a verdict on anyone.',
              result.delivered ? 'good' : 'neutral',
            );
          }
          return result;
        }),
      }, 'Settle'),
    ],
  });
}

/* --------------------------------------------------------- lever dialog */

export function openSignalLeverDialog(ctx, klass, leverRow, hourValue = null) {
  const conventions = conventionsFromSettings(ctx.state.settings);
  const report = buildSignalReport(ctx.state, ctx.now);
  const reading = report.classes.find((row) => row.id === klass.id);
  if (!reading) {
    toast('That class could not be read. Reload and try again.', 'bad');
    return;
  }
  const priced = priceLevers(
    {
      hops: reading.hops,
      direct: reading.direct,
      theta: reading.theta,
      exposure: reading.exposure,
      horizonDays: reading.horizonDays,
      hopCount: reading.reading.hopCount,
    },
    conventions,
    { hourValue },
  );
  const row = leverRow || priced.rows[0];
  if (!row) {
    toast('No lever is priceable for this class.', 'bad');
    return;
  }

  const form = buildForm([
    {
      name: 'ownerId',
      type: 'select',
      label: 'Who spends the hours?',
      required: true,
      value: klass.ownerId || activePeople(ctx.state)[0]?.id || '',
      options: personOptions(ctx.state),
    },
  ]);

  openModal({
    title: row.label,
    description: row.blurb,
    size: 'md',
    body: h('div', { class: 'stack' },
      h('div', { class: 'kv-grid' },
        h('div', null, h('span', { class: 'muted' }, 'Reach'), h('div', null, `${pct(row.reachBefore)} → ${pct(row.reachAfter)}`)),
        h('div', null, h('span', { class: 'muted' }, 'Lag'), h('div', null, `${row.latencyBefore} d → ${row.latencyAfter} d`)),
        h('div', null, h('span', { class: 'muted' }, 'False alarms'), h('div', null, `${pct(row.falseAlarmBefore)} → ${pct(row.falseAlarmAfter)}`)),
        h('div', null, h('span', { class: 'muted' }, 'Your hours'), h('div', null, `${row.hours} h`)),
        h('div', null, h('span', { class: 'muted' }, 'Expected loss avoided'), h('div', null, money(row.value, reading.currency))),
        h('div', null, h('span', { class: 'muted' }, 'Value per hour'), h('div', null, `${money(row.valuePerHour, reading.currency)} vs a ${money(priced.price, reading.currency)} hurdle`))),
      h('p', { class: 'muted small' },
        `The hurdle is ${priced.priceSource}. A lever below it is still shown, because the right answer is sometimes to buy an hour of attention elsewhere and accept the reach.`),
      row.clearsHurdle === false
        ? h('p', { class: 'muted small' }, 'This lever does not clear the hurdle at the current reading. Adopting it is a deliberate choice to override your own opportunity cost — which is allowed, and is recorded.')
        : null,
      form.node),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => ctx.refresh() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => submit(form, (values) => {
          const result = ctx.api.adoptSignalLever(klass.id, row.leverId, { ownerId: values.ownerId, hourValue });
          if (result.ok) {
            ctx.refresh();
            toast(`Adopted for ${row.hours} h. Owned work and a typed edge are on the record.`, 'good');
          }
          return result;
        }),
      }, `Adopt for ${row.hours} h`),
    ],
  });
}
