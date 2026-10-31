/**
 * app/ui/interface-modals.js — accessible dialogs for the Cross-Boundary
 * Interface, Queue-Network & Operating Pact Terminal (Schema v68, ADR-0058).
 */

import { h, toast, openModal } from './dom.js';
import { downloadText } from './download.js';
import { dayKey } from '../core/time.js';
import { INTERFACE_MODES, PACT_STATUSES } from '../core/domain/interfaceSchema.js';
import {
  INTERFACE_MODE_LABELS,
  buildBoundaryResetScript,
} from '../core/domain/interfaces.js';

function field(id, label, control, hint = null) {
  return h(
    'div',
    { class: 'stack-xs' },
    h('label', { for: id }, label),
    control,
    hint ? h('span', { class: 'muted small' }, hint) : null,
  );
}

export function openPactDialog(ctx, existing = null, prefill = null) {
  const activePeople = (ctx.state.people || []).filter((p) => p && p.status !== 'archived');
  const stakeholders = ctx.state.stakeholders || [];
  const dependencies = ctx.state.dependencies || [];
  const seed = existing || prefill || {};

  const titleInput = h('input', {
    id: 'int-pact-title',
    type: 'text',
    maxlength: '160',
    value: seed.title || '',
    placeholder: 'e.g. Product Eng ↔ Security Architecture Review',
  });
  const sourceInput = h('input', {
    id: 'int-pact-source',
    type: 'text',
    maxlength: '80',
    value: seed.sourceUnit || ctx.state.settings?.teamName || 'Core Product',
  });
  const targetInput = h('input', {
    id: 'int-pact-target',
    type: 'text',
    maxlength: '80',
    value: seed.targetUnit || '',
    placeholder: 'e.g. Security & Compliance',
  });
  const modeSelect = h(
    'select',
    { id: 'int-pact-mode' },
    ...INTERFACE_MODES.map((m) =>
      h('option', { value: m, selected: (seed.mode || 'x-as-a-service') === m ? 'selected' : null }, INTERFACE_MODE_LABELS[m] || m),
    ),
  );
  const statusSelect = h(
    'select',
    { id: 'int-pact-status' },
    ...PACT_STATUSES.map((s) =>
      h('option', { value: s, selected: (seed.status || 'active') === s ? 'selected' : null }, s),
    ),
  );
  const ownerSelect = h(
    'select',
    { id: 'int-pact-owner' },
    h('option', { value: '' }, 'Workspace leader (default)'),
    ...activePeople.map((p) =>
      h('option', { value: p.id, selected: seed.ownerId === p.id ? 'selected' : null }, `${p.name} (${p.role || 'team'})`),
    ),
  );
  const shSelect = h(
    'select',
    { id: 'int-pact-sh' },
    h('option', { value: '' }, 'None linked'),
    ...stakeholders.map((s) =>
      h('option', { value: s.id, selected: seed.stakeholderId === s.id ? 'selected' : null }, s.name),
    ),
  );
  const depSelect = h(
    'select',
    { id: 'int-pact-dep' },
    h('option', { value: '' }, 'None linked'),
    ...dependencies.map((d) =>
      h('option', { value: d.id, selected: seed.dependencyId === d.id ? 'selected' : null }, d.name),
    ),
  );

  const arrivalInput = h('input', {
    id: 'int-pact-arrival',
    type: 'number',
    min: '0',
    max: '1000',
    step: '0.5',
    value: seed.externalArrivalPerWeek ?? '4',
  });
  const capacityInput = h('input', {
    id: 'int-pact-capacity',
    type: 'number',
    min: '0.1',
    max: '1000',
    step: '0.5',
    value: seed.serviceCapacityPerWeek ?? '6',
  });
  const reworkInput = h('input', {
    id: 'int-pact-rework',
    type: 'number',
    min: '0',
    max: '95',
    step: '1',
    value: seed.reworkRate !== undefined ? String(Math.round(seed.reworkRate * 100)) : '20',
  });
  const arrCvInput = h('input', {
    id: 'int-pact-arrcv',
    type: 'number',
    min: '0',
    max: '5',
    step: '0.1',
    value: String(seed.arrivalCv ?? 1.0),
  });
  const svcCvInput = h('input', {
    id: 'int-pact-svccv',
    type: 'number',
    min: '0',
    max: '5',
    step: '0.1',
    value: String(seed.serviceCv ?? 1.0),
  });
  const syncInput = h('input', {
    id: 'int-pact-sync',
    type: 'number',
    min: '0',
    max: '80',
    step: '0.5',
    value: String(seed.coordinationHoursPerWeek ?? 2),
  });
  const priceInput = h('input', {
    id: 'int-pact-price',
    type: 'number',
    min: '0',
    step: '100',
    value: seed.weeklyDelayPrice ?? '',
    placeholder: 'Leave blank if unpriced',
  });
  const currencyInput = h('input', {
    id: 'int-pact-currency',
    type: 'text',
    maxlength: '3',
    value: seed.currency || 'USD',
  });
  const turnaroundInput = h('input', {
    id: 'int-pact-sla',
    type: 'number',
    min: '1',
    max: '90',
    step: '1',
    value: String(seed.turnaroundDays ?? 3),
  });
  const wipInput = h('input', {
    id: 'int-pact-wip',
    type: 'number',
    min: '1',
    max: '50',
    step: '1',
    value: seed.wipCap ?? '',
    placeholder: 'Optional concurrent cap',
  });
  const ourGiveInput = h('textarea', {
    id: 'int-pact-our-give',
    rows: '2',
    maxlength: '300',
    value: seed.ourGive || '',
    placeholder: 'Our intake commitment (e.g. complete spec & threat checklist submitted by Tue 12:00)',
  });
  const theirGiveInput = h('textarea', {
    id: 'int-pact-their-give',
    rows: '2',
    maxlength: '300',
    value: seed.theirGive || '',
    placeholder: 'Counterparty service commitment (e.g. written disposition within 3 business days)',
  });
  const escInput = h('input', {
    id: 'int-pact-esc',
    type: 'text',
    maxlength: '240',
    value: seed.escalationRule || '',
    placeholder: 'Graduated trigger (e.g. joint 20m boundary review after 2 SLA or intake misses in 30d)',
  });

  const body = h(
    'div',
    { class: 'form' },
    field('int-pact-title', 'Operating Pact title', titleInput),
    h(
      'div',
      { class: 'grid-2' },
      field('int-pact-source', 'Our unit (source)', sourceInput),
      field('int-pact-target', 'Counterparty unit / gate (target)', targetInput),
    ),
    h(
      'div',
      { class: 'grid-2' },
      field('int-pact-mode', 'Declared Team Topologies mode', modeSelect),
      field('int-pact-status', 'Pact lifecycle status', statusSelect),
    ),
    h(
      'div',
      { class: 'grid-3' },
      field('int-pact-arrival', 'Base outbound asks / wk (λ₀)', arrivalInput),
      field('int-pact-capacity', 'Gate capacity / wk (μ)', capacityInput),
      field('int-pact-rework', 'Bounce / rework % (0–95)', reworkInput),
    ),
    h(
      'div',
      { class: 'grid-3' },
      field('int-pact-arrcv', 'Arrival CV (Cₐ, 1=Poisson)', arrCvInput),
      field('int-pact-svccv', 'Service CV (Cₛ, 1=Exp)', svcCvInput),
      field('int-pact-sync', 'Sync meeting hrs / wk', syncInput),
    ),
    h(
      'div',
      { class: 'grid-3' },
      field('int-pact-sla', 'Agreed turnaround SLA (days)', turnaroundInput),
      field('int-pact-wip', 'Concurrent WIP cap (optional)', wipInput),
      field('int-pact-owner', 'Boundary steward (our side)', ownerSelect),
    ),
    h(
      'div',
      { class: 'grid-2' },
      field('int-pact-price', 'Delay price / item-week (optional)', priceInput, 'Blank = unpriced, never zero.'),
      field('int-pact-currency', '3-letter ISO currency', currencyInput),
    ),
    field('int-pact-our-give', 'Our Give — intake hygiene commitment', ourGiveInput, 'Checked by the Clean-Hands Gate before any counterparty escalation.'),
    field('int-pact-their-give', 'Their Give — turnaround & service commitment', theirGiveInput),
    field('int-pact-esc', 'Graduated Ostrom escalation rule (optional)', escInput),
    h(
      'div',
      { class: 'grid-2' },
      field('int-pact-sh', 'Counterparty stakeholder (optional)', shSelect),
      field('int-pact-dep', 'Underlying dependency (optional)', depSelect),
    ),
  );

  const modal = openModal({
    title: existing ? `Edit Operating Pact — ${existing.title}` : 'Declare Cross-Boundary Operating Pact',
    description: 'Models the Jackson/Whitt queueing network, Naor congestion externality, and symmetric give-get compliance.',
    body,
    size: 'lg',
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'),
      h(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => {
            const payload = {
              title: titleInput.value,
              sourceUnit: sourceInput.value,
              targetUnit: targetInput.value,
              mode: modeSelect.value,
              status: statusSelect.value,
              ownerId: ownerSelect.value || null,
              stakeholderId: shSelect.value || null,
              dependencyId: depSelect.value || null,
              externalArrivalPerWeek: arrivalInput.value === '' ? null : Number(arrivalInput.value),
              serviceCapacityPerWeek: capacityInput.value === '' ? null : Number(capacityInput.value),
              reworkRate: Number(reworkInput.value || 0) / 100,
              arrivalCv: Number(arrCvInput.value || 1),
              serviceCv: Number(svcCvInput.value || 1),
              coordinationHoursPerWeek: Number(syncInput.value || 0),
              weeklyDelayPrice: priceInput.value === '' ? null : Number(priceInput.value),
              currency: currencyInput.value,
              turnaroundDays: Number(turnaroundInput.value || 3),
              wipCap: wipInput.value === '' ? null : Number(wipInput.value),
              ourGive: ourGiveInput.value,
              theirGive: theirGiveInput.value,
              escalationRule: escInput.value,
            };
            const res = existing
              ? ctx.api.updateInterfacePact(existing.id, payload)
              : ctx.api.addInterfacePact(payload);
            if (!res?.ok) {
              toast(res?.error || 'Could not save Operating Pact.', 'bad');
              return;
            }
            modal.close();
            toast(existing ? 'Operating Pact updated.' : 'Operating Pact declared and evaluated.', 'good');
            ctx.navigate(`#/interfaces?panel=pacts&pact=${encodeURIComponent(res.id)}`);
          },
        },
        existing ? 'Save changes' : 'Declare pact',
      ),
    ],
  });
}

export function openExchangeDialog(ctx, pact) {
  const today = dayKey(ctx.now);
  const dateInput = h('input', { id: 'int-ex-date', type: 'date', value: today });
  const summaryInput = h('input', {
    id: 'int-ex-summary',
    type: 'text',
    maxlength: '200',
    placeholder: 'e.g. Checkout token rotation review',
  });
  const cleanSelect = h(
    'select',
    { id: 'int-ex-clean' },
    h('option', { value: 'yes' }, 'Yes — our ask met our agreed intake spec'),
    h('option', { value: 'no' }, 'No — incomplete spec, unbatched or rush drop'),
  );
  const turnaroundInput = h('input', {
    id: 'int-ex-days',
    type: 'number',
    min: '0',
    max: '365',
    step: '0.5',
    value: String(pact.turnaroundDays),
    placeholder: 'Leave blank if still in flight',
  });
  const bouncedSelect = h(
    'select',
    { id: 'int-ex-bounced' },
    h('option', { value: 'no' }, 'No — cleared in single pass'),
    h('option', { value: 'yes' }, 'Yes — bounced back for rework / clarification'),
  );

  const body = h(
    'div',
    { class: 'form' },
    h(
      'p',
      { class: 'muted small' },
      `Symmetric logging on “${pact.title}” (target ≤${pact.turnaroundDays}d): record our own intake fidelity honestly alongside counterparty turnaround.`,
    ),
    h(
      'div',
      { class: 'grid-2' },
      field('int-ex-date', 'Exchange date (not future)', dateInput),
      field('int-ex-days', `Elapsed turnaround days (SLA ≤${pact.turnaroundDays}d)`, turnaroundInput, 'Clear if still open.'),
    ),
    field('int-ex-summary', 'Handoff summary (optional)', summaryInput),
    field('int-ex-clean', 'Did OUR handoff meet our agreed intake commitment?', cleanSelect),
    field('int-ex-bounced', 'Did the item bounce back for rework?', bouncedSelect),
  );

  const modal = openModal({
    title: `Log boundary exchange — ${pact.sourceUnit} → ${pact.targetUnit}`,
    description: 'Updates empirical bounce rate, Wilson 95% compliance intervals, and Clean-Hands Gate.',
    body,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'),
      h(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => {
            const res = ctx.api.recordInterfaceExchange(pact.id, {
              recordedOn: dateInput.value,
              summary: summaryInput.value,
              intakeClean: cleanSelect.value === 'yes',
              turnaroundDays: turnaroundInput.value === '' ? null : Number(turnaroundInput.value),
              bounced: bouncedSelect.value === 'yes',
            });
            if (!res?.ok) {
              toast(res?.error || 'Could not log exchange.', 'bad');
              return;
            }
            modal.close();
            toast('Exchange recorded and evaluated on the propagation spine.', 'good');
            ctx.navigate(`#/interfaces?panel=pacts&pact=${encodeURIComponent(pact.id)}`);
          },
        },
        'Record exchange',
      ),
    ],
  });
}

export function openFreezeInterfaceAuditDialog(ctx, row) {
  const horizonInput = h('input', {
    id: 'int-aud-horizon',
    type: 'number',
    min: '7',
    max: '180',
    step: '1',
    value: String(ctx.state.settings?.interfaceReviewHorizonDays ?? 28),
  });
  const probInput = h('input', {
    id: 'int-aud-prob',
    type: 'number',
    min: '5',
    max: '95',
    step: '1',
    value: '75',
  });

  const body = h(
    'div',
    { class: 'form' },
    h(
      'p',
      { class: 'muted small' },
      `Freezes a content-free aggregate baseline on “${row.pact.title}” (ρ = ${row.queue.rho !== null ? `${Math.round(row.queue.rho * 100)}%` : 'unparameterized'}, exchanges = ${row.compliance.totalExchanges}). Graded irreversibly once after the review date from settled exchanges in the window.`,
    ),
    field('int-aud-horizon', 'Review horizon (7–180 days)', horizonInput),
    field(
      'int-aud-prob',
      'Predicted probability of ≥80% joint clean-exchange compliance (5–95%)',
      probInput,
      'Scored once with Brier (1950); requires ≥3 settled exchanges inside the window to grade.',
    ),
  );

  const modal = openModal({
    title: `Freeze prospective Pact Audit — ${row.pact.sourceUnit} ↔ ${row.pact.targetUnit}`,
    description: 'Pre-register a falsifiable compliance prediction before boundary changes play out.',
    body,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Cancel'),
      h(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => {
            const res = ctx.api.freezeInterfaceAudit(row.pact.id, {
              horizonDays: Number(horizonInput.value || 28),
              predictedComplianceProb: Number(probInput.value || 75) / 100,
            });
            if (!res?.ok) {
              toast(res?.error || 'Could not freeze Pact Audit.', 'bad');
              return;
            }
            modal.close();
            toast('Prospective Pact Audit frozen and linked.', 'good');
            ctx.navigate(`#/interfaces?panel=audits&audit=${encodeURIComponent(res.id)}`);
          },
        },
        'Freeze forecast',
      ),
    ],
  });
}

export function openResetScriptDialog(ctx, row) {
  const script = buildBoundaryResetScript(row);
  const area = h('textarea', {
    id: 'int-reset-script',
    rows: '14',
    readonly: 'readonly',
    value: script,
  });
  const modal = openModal({
    title: `Principled Boundary Reset Script — ${row.pact.sourceUnit} ↔ ${row.pact.targetUnit}`,
    description: 'Deterministic, zero-LLM Fisher & Ury / Gibbons & Henderson script. Opens with our own factual intake record before stating queue physics and give-get options.',
    body: h('div', { class: 'form' }, field('int-reset-script', 'Boundary reset agenda & talking script', area)),
    size: 'lg',
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => modal.close() }, 'Close'),
      h(
        'button',
        {
          class: 'btn btn-primary',
          type: 'button',
          onClick: () => {
            downloadText(`leados-boundary-reset-${row.pact.id}-${dayKey(ctx.now)}.txt`, script, 'text/plain;charset=utf-8');
            toast('Downloaded boundary reset script.', 'good');
          },
        },
        'Download .txt',
      ),
    ],
  });
}
