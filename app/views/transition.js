/**
 * app/views/transition.js — the Workforce Transition Terminal (`#/transition`,
 * Schema v52).
 *
 * Every other screen answers "what did I decide?" or "did the number move?".
 * This one answers the question a leader is most afraid of getting wrong, and
 * which almost nothing in the management-software market asks at all:
 *
 *   *is this list a decision, or is it the answer to my own weight table — and
 *   what does it cost to make it defensible, in money, in capability and in the
 *   workload it leaves behind?*
 *
 * The page never merges the things that must stay apart: the leader's proposed
 * names and the model's recommendation, the measured ratio and the legal
 * question, the plan's cost and the cost of the alternative plan, the knowledge
 * that leaves and the task that records where it went.
 */

import { h, toast, confirmDialog, openModal } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, table, emptyState, kv } from '../ui/components.js';
import { progressBar } from '../ui/charts.js';
import { downloadText } from '../ui/download.js';
import { addDays, formatDate } from '../core/time.js';
import {
  TRANSITION_CONVENTIONS,
  TRANSITION_CRITERIA,
  TRANSITION_DIMENSION_LABELS,
  TRANSITION_DIMENSIONS,
  TRANSITION_GATES,
  TRANSITION_GATE_STATUSES,
  TRANSITION_KIND_LABELS,
  TRANSITION_KINDS,
  TRANSITION_STATUS_LABELS,
  availableCriteria,
  normalizeWeights,
  scoreRows,
  transitionBrief,
  transitionReading,
} from '../core/domain/transition.js';
import { TRANSITION_MAX_NOTE } from '../core/domain/transitionSchema.js';

const TONE_BY_STATUS = {
  done: 'good',
  due: 'warn',
  overdue: 'bad',
  blocked: 'bad',
  upcoming: 'neutral',
};

const TONE_BY_BAND = {
  core: 'bad',
  'knife-edge': 'warn',
  'stable-retained': 'good',
};

function money(value, currency = 'USD') {
  if (!Number.isFinite(Number(value))) return '—';
  return `${currency} ${Math.round(Number(value)).toLocaleString('en-US')}`;
}

function pct(value, dp = 0) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 10 ** dp) / 10 ** dp}%` : '—';
}

function short(value, n = 90) {
  const text = String(value || '').trim();
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

/* -------------------------------------------------------------- declaration */

function openProgramDialog(ctx) {
  const today = ctx.today || new Date().toISOString().slice(0, 10);
  const active = (ctx.state.people || []).filter((person) => person.status !== 'archived');
  const label = h('input', { id: 'trn-label', type: 'text', maxlength: '140', required: 'required' });
  const currency = h('input', { id: 'trn-currency', type: 'text', maxlength: '3', value: 'USD' });
  const kind = h('select', { id: 'trn-kind' },
    ...TRANSITION_KINDS.map((key) => h('option', { value: key }, TRANSITION_KIND_LABELS[key])));
  const effectiveOn = h('input', { id: 'trn-effective', type: 'date', value: addDays(today, 90), min: addDays(today, 1) });
  const headcount = h('input', { id: 'trn-headcount', type: 'number', min: '1', max: '300', value: '1' });
  const costCeiling = h('input', { id: 'trn-ceiling', type: 'number', min: '0', placeholder: 'Optional' });
  const dimension = h('select', { id: 'trn-dimension' },
    ...TRANSITION_DIMENSIONS.map((key) => h('option', { value: key }, TRANSITION_DIMENSION_LABELS[key])));
  const owner = h('select', { id: 'trn-owner' },
    h('option', { value: '' }, 'No single owner (decide will refuse)'),
    ...active.map((person) => h('option', { value: person.id }, person.name)));
  const notices = h('input', { id: 'trn-notice', type: 'number', min: '1', max: '365', value: String(TRANSITION_CONVENTIONS.noticeDays) });
  const severance = h('input', { id: 'trn-severance', type: 'number', min: '0', max: '3', step: '0.25', value: String(TRANSITION_CONVENTIONS.severanceMonthsPerYear) });
  const cap = h('input', { id: 'trn-cap', type: 'number', min: '0', max: '24', value: String(TRANSITION_CONVENTIONS.severanceCapMonths) });
  const floor = h('input', { id: 'trn-floor', type: 'number', min: '0.5', max: '1', step: '0.05', value: String(TRANSITION_CONVENTIONS.impactRatio) });

  const weightInputs = new Map();
  const weightFields = TRANSITION_CRITERIA.map((criterion) => {
    const input = h('input', { id: `trn-w-${criterion.key}`, type: 'number', min: '0', max: '100', value: String(criterion.weight) });
    weightInputs.set(criterion.key, input);
    return h('div', { class: 'stack-xs' },
      h('label', { for: `trn-w-${criterion.key}` }, criterion.label),
      input,
      h('span', { class: 'muted small' }, criterion.direction));
  });

  const dialog = openModal({
    title: 'Declare a workforce transition programme',
    description: 'The target, the criteria and the comparison dimension are captured before any name is. A target chosen after the shortlist describes a decision; it does not constrain one.',
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'trn-label' }, 'What is this programme?'), label),
        h('div', { class: 'stack-xs' }, h('label', { for: 'trn-kind' }, 'Kind'), kind),
        h('div', { class: 'stack-xs' }, h('label', { for: 'trn-currency' }, 'Currency'), currency),
        h('div', { class: 'stack-xs' }, h('label', { for: 'trn-effective' }, 'Effective date'), effectiveOn),
        h('div', { class: 'stack-xs' }, h('label', { for: 'trn-headcount' }, 'Roles to remove'), headcount),
        h('div', { class: 'stack-xs' }, h('label', { for: 'trn-ceiling' }, 'Cash ceiling (optional)'), costCeiling),
        h('div', { class: 'stack-xs' }, h('label', { for: 'trn-dimension' }, 'Comparison dimension'), dimension),
        h('div', { class: 'stack-xs' }, h('label', { for: 'trn-owner' }, 'Accountable owner'), owner)),
      h('p', { class: 'muted small' },
        'The comparison dimension is the grouping the selection screen runs over. It is an organisational dimension, or opaque codes you supply from your own HR classification — this app never stores what a code means, and it stores no protected characteristic at all.'),
      h('h3', { class: 'subhead' }, 'Criteria weights'),
      h('p', { class: 'muted small' },
        'These weights produce the model’s recommendation and nothing else. The robustness read re-solves the same problem under 240 perturbed weightings, so a name that only appears under your weights is printed as a name your weights chose.'),
      h('div', { class: 'form-grid' }, ...weightFields),
      h('h3', { class: 'subhead' }, 'Conventions in force'),
      h('p', { class: 'muted small' },
        'Notice and severance are declared conventions applied to recorded pay. They are not legal advice, they do not model tax or statutory deductions, and they are stored on the workspace so every programme uses the same arithmetic.'),
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'trn-notice' }, 'Notice, days'), notices),
        h('div', { class: 'stack-xs' }, h('label', { for: 'trn-severance' }, 'Severance months per year of service'), severance),
        h('div', { class: 'stack-xs' }, h('label', { for: 'trn-cap' }, 'Severance cap, months'), cap),
        h('div', { class: 'stack-xs' }, h('label', { for: 'trn-floor' }, 'Selection ratio floor (four-fifths)'), floor))),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const settingsPatch = {
            transitionNoticeDays: Number(notices.value),
            transitionSeveranceMonthsPerYear: Number(severance.value),
            transitionSeveranceCapMonths: Number(cap.value),
            transitionImpactRatio: Number(floor.value),
          };
          const settingsResult = ctx.api.updateSettings(settingsPatch);
          if (!settingsResult.ok) { toast(settingsResult.error, 'bad'); return; }
          const weights = {};
          for (const criterion of TRANSITION_CRITERIA) weights[criterion.key] = Number(weightInputs.get(criterion.key).value);
          const result = ctx.api.addTransitionProgram({
            label: label.value,
            currency: currency.value,
            kind: kind.value,
            effectiveOn: effectiveOn.value,
            headcount: headcount.value,
            costCeiling: costCeiling.value,
            dimension: dimension.value,
            ownerId: owner.value,
            weights,
          });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast('Programme declared. The pool is empty: adding people to it does not select anyone.', 'good');
          ctx.navigate(`#/transition?program=${encodeURIComponent(result.id)}`);
        },
      }, 'Declare the programme'),
    ],
  });
}

/* ------------------------------------------------------------- row decision */

function openRowDialog(ctx, program, row, facts, score, stability) {
  const currency = program.currency || 'USD';
  const selectable = !facts.soleHolder && facts.stillActive;
  const selected = h('input', { id: 'trn-row-selected', type: 'checkbox', ...(facts.declared ? { checked: 'checked' } : {}), ...(selectable ? {} : { disabled: 'disabled' }) });
  const locked = h('input', { id: 'trn-row-locked', type: 'checkbox', ...(facts.locked ? { checked: 'checked' } : {}) });
  const group = h('input', { id: 'trn-row-group', type: 'text', maxlength: '8', value: row.group || '', placeholder: 'e.g. G1' });
  const mobility = h('input', { id: 'trn-row-mobility', type: 'number', min: '0', max: '100', value: row.mobility === null || row.mobility === undefined ? '' : String(row.mobility), placeholder: '0–100, optional' });
  const workload = h('input', { id: 'trn-row-workload', type: 'number', min: '0', max: '1000', step: '0.5', value: row.workloadUnits === null || row.workloadUnits === undefined ? '' : String(row.workloadUnits), placeholder: `Recorded: ${facts.workloadUnits}` });
  const note = h('textarea', { id: 'trn-row-note', rows: '3', maxlength: String(TRANSITION_MAX_NOTE) });
  note.value = row.note || '';

  const factsList = h('div', { class: 'kv-list' },
    kv('Last completed review', facts.rating ? `${facts.rating} (${formatDate(facts.ratingOn)})` : 'No completed review — this is a printed gap, not a zero'),
    kv('Tenure', Number.isFinite(facts.tenureYears) ? `${facts.tenureYears} years` : 'No start date recorded'),
    kv('Recorded pay', facts.pay ? `${money(facts.pay, currency)} · from “${facts.paySource?.cycleLabel || 'a merit cycle'}”` : 'No recorded pay — the exit cannot be priced'),
    kv('Exit cost under the conventions', facts.exitStatus === 'priced' ? `${money(facts.exitCost, currency)} (notice ${money(facts.noticePay, currency)} + severance ${facts.severanceMonths} months)` : 'Unpriced'),
    kv('Replacement exposure', facts.replacementCost ? `${money(facts.replacementCost, currency)}${facts.benchScarce ? ' · no ready-now bench' : ''}` : '—'),
    kv('Capability value', `${Math.round(facts.capabilityRaw * 10) / 10} · ${facts.stewardships.length} stewardship(s), ${facts.readyNow} ready-now seat(s), ${facts.openCases} open case(s)`),
    kv('Composite exposure', score === null ? '—' : `${Math.round(score * 100)}/100${stability ? ` · selected in ${stability.pct}% of weightings (${stability.band})` : ''}`));

  const dialog = openModal({
    title: `Decide ${facts.name}’s row`,
    description: 'Marking a person is a leadership decision the model never makes. Locking a row means the recommendation will fill around it instead of over it.',
    body: h('div', { class: 'view-stack' },
      factsList,
      facts.soleHolder
        ? banner({
          tone: 'bad',
          title: 'Not selectable: sole recorded steward of a critical dependency',
          body: 'The workspace has already recorded that nobody else covers this. Reassign the dependency first, then the row becomes available — selecting it now would plan to remove cover the records say does not exist.',
        })
        : null,
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'trn-row-selected' }, 'Propose this exit'), selected),
        h('div', { class: 'stack-xs' }, h('label', { for: 'trn-row-locked' }, 'Lock this decision'), locked),
        h('div', { class: 'stack-xs' }, h('label', { for: 'trn-row-group' }, 'Opaque group code (optional)'), group),
        h('div', { class: 'stack-xs' }, h('label', { for: 'trn-row-mobility' }, 'Outside-option mobility (0–100)'), mobility),
        h('div', { class: 'stack-xs' }, h('label', { for: 'trn-row-workload' }, 'Ownership units (override)'), workload)),
      h('div', { class: 'stack-xs' }, h('label', { for: 'trn-row-note' }, 'Reason (stored locally, never exported)'), note),
      h('p', { class: 'muted small' },
        'Mobility feeds the voluntary-alternative model: a volunteer compares the offer with their own outside option, so take-up concentrates among the most mobile. It is a declared judgement, not a measured fact, and it is used only in the alternatives comparison.')),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.setTransitionRow(program.id, facts.personId, {
            selected: selected.checked,
            locked: locked.checked,
            group: group.value,
            mobility: mobility.value === '' ? null : Number(mobility.value),
            workloadUnits: workload.value === '' ? null : Number(workload.value),
            note: note.value,
          });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast(selected.checked ? 'Row marked as a proposed exit.' : 'Row kept.', 'good');
          ctx.refresh();
        },
      }, 'Save the decision'),
    ],
  });
}

/* --------------------------------------------------------------- gate check */

function openGateDialog(ctx, program, gate) {
  const done = h('input', { id: 'trn-gate-done', type: 'checkbox', ...(gate.status === 'done' ? { checked: 'checked' } : {}) });
  const blocked = h('input', { id: 'trn-gate-blocked', type: 'checkbox', ...(gate.status === 'blocked' ? { checked: 'checked' } : {}) });
  const note = h('textarea', { id: 'trn-gate-note', rows: '3', maxlength: '400' });
  note.value = gate.note || '';
  const dialog = openModal({
    title: gate.label,
    description: `Due ${formatDate(gate.on)} · owner: ${gate.owner}. A gate is a recorded human check, never inferred from the presence of a document.`,
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'trn-gate-done' }, 'Done'), done),
        h('div', { class: 'stack-xs' }, h('label', { for: 'trn-gate-blocked' }, 'Blocked'), blocked)),
      h('div', { class: 'stack-xs' }, h('label', { for: 'trn-gate-note' }, 'What actually happened'), note)),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.recordTransitionGate(program.id, gate.key, {
            done: done.checked,
            blocked: blocked.checked,
            note: note.value,
          });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast('Gate recorded.', 'good');
          ctx.refresh();
        },
      }, 'Record the check'),
    ],
  });
}

/* -------------------------------------------------------------------- panels */

function ownerCard(ctx, program) {
  const active = (ctx.state.people || []).filter((person) => person.status !== 'archived');
  const current = active.find((person) => person.id === program.ownerId) || null;
  const locked = program.status === 'finalized' || program.status === 'abandoned';
  const select = h('select', { id: 'trn-owner-select', 'aria-label': 'Accountable owner' },
    h('option', { value: '' }, 'No single owner'),
    ...active.map((person) => h('option', { value: person.id, ...(current && current.id === person.id ? { selected: 'selected' } : {}) }, person.name)));
  return card({
    title: 'Accountability',
    subtitle: 'Decide and finalize both refuse a programme nobody owns — the hand-overs, the evidence task and the outcome review are owned work.',
    body: h('div', { class: 'view-stack' },
      banner({
        tone: current ? 'good' : 'warn',
        title: current ? `${current.name} is accountable for this programme` : 'No accountable owner is named',
        body: current
          ? 'Typed `stewards` provenance links this programme to them, and the generated tasks are assigned to them.'
          : 'A plan with no owner generates no hand-overs and no outcome review, so the gates below will refuse until one is named.',
      }),
      locked ? null : h('div', { class: 'row-wrap' },
        select,
        h('button', {
          class: 'btn btn-ghost btn-sm',
          type: 'button',
          onClick: () => {
            const result = ctx.api.updateTransitionProgram(program.id, { ownerId: select.value });
            if (!result.ok) { toast(result.error, 'bad'); return; }
            toast(select.value ? 'Owner recorded.' : 'Owner cleared; the decision gates will refuse until one is named.', 'good');
            ctx.refresh();
          },
        }, 'Save owner')),
      h('p', { class: 'muted small' },
        'Naming an owner does not name any exit. It records who answers for the process, including how it is communicated.')),
  });
}

function planPanel(ctx, program, reading) {
  const currency = program.currency || 'USD';
  const weights = normalizeWeights(program.weights, availableCriteria(reading.active)).weights;
  const scored = scoreRows(reading.active, weights);
  const scoreById = new Map(scored.rows.map((row) => [row.personId, row.score]));
  const stableById = reading.robustness.byPerson || new Map();

  const stats = h('div', { class: 'stat-grid' },
    stat({
      label: 'Named exits',
      value: `${reading.plan.proposed.length} / ${reading.plan.target}`,
      hint: reading.plan.shortfall
        ? `${reading.plan.shortfall} still to name — the gap is reported, never filled in by the model`
        : 'Target met',
      tone: reading.plan.shortfall ? 'warn' : 'good',
    }),
    stat({
      label: 'Cash cost',
      value: money(reading.plan.cost, currency),
      hint: `${reading.plan.unpriced} unpriced exit(s)${reading.plan.costCeiling ? ` · ceiling ${money(reading.plan.costCeiling, currency)}` : ''}`,
      tone: reading.plan.costCeilingBreached ? 'bad' : reading.plan.unpriced ? 'warn' : 'good',
    }),
    stat({
      label: 'Capability leaving',
      value: pct(reading.plan.capabilityLostPct, 1),
      hint: `${reading.plan.highPerformersLost} high performer(s) · replacement exposure ${money(reading.plan.replacementExposure, currency)}`,
      tone: reading.plan.capabilityLostPct > 25 ? 'bad' : reading.plan.capabilityLostPct > 12 ? 'warn' : 'good',
    }),
    stat({
      label: 'Decision robustness',
      value: reading.robustness.status === 'ok' ? `${reading.robustness.core.length} / ${reading.robustness.knifeEdge.length} / ${reading.robustness.stableRetained.length}` : '—',
      hint: reading.robustness.status === 'ok'
        ? `core / knife-edge / stable across ${reading.robustness.draws} weightings`
        : reading.robustness.reason,
      tone: reading.robustness.knifeEdge.length ? 'warn' : 'good',
    }));

  const timelineCard = card({
    title: 'Process ledger',
    subtitle: 'Backwards-planned from the effective date. Every gate is a recorded human check.',
    body: h('div', { class: 'view-stack' },
      reading.timeline.note ? banner({ tone: 'bad', title: 'The hand-over gate is late', body: reading.timeline.note }) : null,
      table({
        caption: 'Process gates, their dates, owners, and recorded status',
        columns: [
          { key: 'gate', label: 'Gate', render: ({ row }) => h('div', null, h('div', null, row.gate), h('div', { class: 'muted small' }, row.owner)) },
          { key: 'on', label: 'Due', render: ({ row }) => row.on },
          { key: 'status', label: 'Status', render: ({ row }) => row.status },
          { key: 'note', label: 'Recorded', render: ({ row }) => row.note },
          { key: 'action', label: 'Action', render: ({ row }) => row.action },
        ],
        rows: reading.timeline.gates.map((gate) => ({
          row: {
            gate: gate.label,
            on: formatDate(gate.on),
            status: badge(gate.status, TONE_BY_STATUS[gate.status] || 'neutral', TRANSITION_GATE_STATUSES.includes(gate.status) ? '' : ''),
            note: gate.note ? short(gate.note, 70) : h('span', { class: 'muted small' }, 'Not recorded'),
            action: h('button', {
              class: 'btn btn-ghost btn-sm',
              type: 'button',
              'aria-label': `Record the ${gate.label} gate`,
              onClick: () => openGateDialog(ctx, program, gate),
            }, 'Record'),
          },
        })),
      }),
      h('p', { class: 'muted small' },
        `${reading.timeline.done} of ${reading.timeline.gates.length} gate(s) recorded complete${reading.timeline.overdue ? `; ${reading.timeline.overdue} overdue` : ''}. An overdue gate is a date, not a failure: the ledger exists so nobody has to remember which checks happened.`),
    ),
  });

  const candidatesTable = table({
    caption: 'Candidate pool with composite exposure, stability and the proposed decision',
    columns: [
      { key: 'person', label: 'Person', render: ({ row }) => row.person },
      { key: 'evidence', label: 'Evidence', render: ({ row }) => row.evidence },
      { key: 'cost', label: 'Exit cost', render: ({ row }) => row.cost },
      { key: 'score', label: 'Composite exposure', render: ({ row }) => row.score },
      { key: 'stability', label: 'Weight stability', render: ({ row }) => row.stability },
      { key: 'state', label: 'Decision', render: ({ row }) => row.state },
      { key: 'action', label: 'Action', render: ({ row }) => row.action },
    ],
    rows: reading.facts.rows.map((facts) => {
      const row = (program.rows || []).find((entry) => entry.personId === facts.personId) || { personId: facts.personId };
      const score = scoreById.get(facts.personId) ?? null;
      const stability = stableById.get?.(facts.personId) || null;
      return {
        row: {
          person: h('div', null,
            h('div', null, facts.name),
            h('div', { class: 'muted small' }, `${facts.role || 'No role recorded'} · ${facts.team} · ${facts.level}`)),
          evidence: h('div', { class: 'muted small' },
            h('div', null, facts.rating ? `Last review: ${facts.rating}` : 'No completed review'),
            h('div', null, Number.isFinite(facts.tenureYears) ? `${facts.tenureYears}y tenure` : 'Tenure unknown'),
            h('div', null, facts.soleHolder ? 'Sole steward of a critical dependency' : `${facts.stewardships.length} stewardship(s), ${facts.readyNow} ready-now seat(s)`)),
          cost: facts.exitStatus === 'priced'
            ? h('div', null, h('div', null, money(facts.exitCost, currency)), h('div', { class: 'muted small' }, `${facts.severanceMonths} mo severance`))
            : h('span', { class: 'muted small' }, 'Unpriced'),
          score: score === null ? h('span', { class: 'muted small' }, '—') : h('div', null,
            h('div', null, `${Math.round(score * 100)}/100`),
            progressBar(Math.round(score * 100), { thin: true, label: `Composite exposure for ${facts.name}` })),
          stability: stability
            ? badge(`${stability.pct}% ${stability.band}`, TONE_BY_BAND[stability.band] || 'neutral',
              'Share of perturbed weightings that select this person. A knife-edge band means the weight table, not the record, decides them.')
            : h('span', { class: 'muted small' }, reading.robustness.status === 'ok' ? '—' : 'not computed'),
          state: facts.declared
            ? h('div', { class: 'row-wrap' }, badge('Proposed exit', 'bad'), facts.locked ? badge('locked', 'warn') : null)
            : h('span', { class: 'muted small' }, facts.locked ? 'Locked: kept' : 'Not proposed'),
          action: h('button', {
            class: 'btn btn-ghost btn-sm',
            type: 'button',
            'aria-label': `Decide ${facts.name}’s row`,
            onClick: () => openRowDialog(ctx, program, row, facts, score, stability),
          }, 'Decide'),
        },
      };
    }),
  });

  const emptyPool = !reading.facts.rows.length;

  return h('div', { class: 'view-stack' },
    stats,
    ownerCard(ctx, program),
    timelineCard,
    card({
      title: 'Candidate pool',
      subtitle: 'Composite exposure is a weighted sum of the declared criteria. It orders a conversation; it does not make the decision.',
      actions: [
        h('button', {
          class: 'btn btn-ghost btn-sm',
          type: 'button',
          onClick: () => {
            const result = ctx.api.syncTransitionRoster(program.id);
            if (!result.ok) { toast(result.error, 'bad'); return; }
            toast(result.added ? `${result.added} person(s) added to the pool, none selected.` : 'The pool already holds every active person.', result.added ? 'good' : 'neutral');
            ctx.refresh();
          },
        }, 'Fill pool from roster'),
      ],
      body: emptyPool
        ? emptyState({
          title: 'The pool is empty',
          body: 'Add the people who are eligible to be considered. Adding someone to the pool is not selecting them — that distinction is the whole point of the two steps.',
          action: h('button', {
            class: 'btn btn-primary',
            type: 'button',
            onClick: () => {
              const result = ctx.api.syncTransitionRoster(program.id);
              if (!result.ok) { toast(result.error, 'bad'); return; }
              toast(`${result.added} person(s) added, none selected.`, 'good');
              ctx.refresh();
            },
          }, 'Fill the pool from the roster'),
        })
        : candidatesTable,
    }),
    card({
      title: 'What the model would choose under your weights',
      subtitle: 'A recommendation, printed beside the plan rather than applied to it.',
      body: h('div', { class: 'view-stack' },
        h('p', null,
          `Allowing the optimizer to fill the ${reading.plan.target} target around your locked rows selects `
          + (reading.plan.recommended.selected.length
            ? `${reading.plan.recommended.selected.length} person(s) at ${money(reading.plan.recommended.cost, currency)}`
            : 'nobody — there is nothing eligible')
          + `, losing ${Math.round(reading.plan.recommended.capability)} capability units`
          + (reading.plan.recommended.gapPct !== null ? `, within ${reading.plan.recommended.gapPct}% of the fractional-relaxation bound (a bound, not a proof of optimality)` : '')
          + `. It required ${reading.plan.recommended.repairs} cost repair(s).`),
        reading.plan.recommended.excluded.length
          ? h('ul', { class: 'list-plain stack-xs' },
            ...reading.plan.recommended.excluded.slice(0, 8).map((entry) => h('li', null,
              `${entry.row.name}: excluded (${entry.reason}).`)))
          : null,
        h('p', { class: 'muted small' },
          'The optimizer is greedy construction plus swap repair. The headcount-plus-cost problem is a knapsack, so the gap above is the honest statement of how much better a perfect planner could conceivably do — not a claim that this list is optimal.')),
    }),
  );
}

function exposurePanel(ctx, program, reading) {
  const screen = reading.screen;
  const compliance = reading.compliance;
  const currency = program.currency || 'USD';

  const screenCard = card({
    title: 'Selection screen',
    subtitle: `Four-fifths screen over “${TRANSITION_DIMENSION_LABELS[screen.dimension] || screen.dimension}”, applied to the decision rather than to headcount.`,
    body: h('div', { class: 'view-stack' },
      banner({
        tone: screen.status !== 'ok' ? 'warn' : screen.flagged ? (screen.reliable ? 'bad' : 'warn') : 'good',
        title: screen.status !== 'ok'
          ? 'The screen cannot be computed honestly on this pool'
          : screen.flagged
            ? `Ratio ${screen.ratio} — below the ${screen.threshold} floor`
            : `Ratio ${screen.ratio} — at or above the ${screen.threshold} floor`,
        body: screen.detail,
      }),
      screen.groups?.length
        ? table({
          caption: 'Selection rate per group with Wilson 95% intervals',
          columns: [
            { key: 'group', label: 'Group', render: ({ row }) => row.group },
            { key: 'selected', label: 'Selected', render: ({ row }) => row.selected },
            { key: 'rate', label: 'Rate', render: ({ row }) => row.rate },
            { key: 'interval', label: '95% interval', render: ({ row }) => row.interval },
            { key: 'bar', label: 'Share', render: ({ row }) => row.bar },
          ],
          rows: screen.groups.map((group) => ({
            row: {
              group: group.label,
              selected: `${group.selected} of ${group.n}`,
              rate: `${group.ratePct}%`,
              interval: `${group.lowPct}% – ${group.highPct}%`,
              bar: progressBar(group.ratePct, { thin: true, label: `Selection rate for ${group.label}` }),
            },
          })),
        })
        : h('p', { class: 'muted small' }, screen.detail),
      screen.excluded?.length
        ? h('p', { class: 'muted small' },
          `Outside the comparison: `
          + screen.excluded.map((group) => (group.reason === 'no-group'
            ? `${group.n} candidate(s) with no group code`
            : `${group.label} (${group.n}, below the ${ctx.state.settings?.transitionMinGroupSize ?? 5}-person floor)`)).join(', ')
          + '. Everything excluded is printed so its absence from the ratio is visible, not hidden.')
        : null,
      screen.fragility?.statement
        ? h('p', { class: 'muted small' }, screen.fragility.statement)
        : null,
      h('p', { class: 'muted small' },
        'The screen is a heuristic. It measures an effect size and not statistical significance, so a single selection can change which group looks worse — the sentence above states how many. A ratio above the floor does not prove fairness and one below it does not prove discrimination: it flags a question about the criteria. What it cannot do is the statutory analysis a legal team performs, because this app stores no protected characteristic — use opaque codes if you have them.')),
  });

  const complianceCard = card({
    title: 'The price of compliance',
    subtitle: 'If the plan breaches the floor, the cheapest set of swaps that satisfies it — priced, not asserted.',
    body: compliance.status !== 'ok'
      ? h('p', { class: 'muted small' }, compliance.detail)
      : compliance.alreadyCompliant
        ? h('div', { class: 'view-stack' },
          h('p', null, compliance.detail),
          h('p', { class: 'muted small' },
            'No swap is ever invented to make a compliant plan look better. The honest output of a screen that passes is that it passed.'))
        : h('div', { class: 'view-stack' },
          banner({
            tone: compliance.feasible ? 'warn' : 'bad',
            title: compliance.feasible
              ? `Complies at ${compliance.after.ratio}: ${compliance.swaps.length} swap(s), ${money(compliance.costDelta, currency)} more cash`
              : 'No swap set inside this plan reaches the floor',
            body: compliance.detail,
          }),
          compliance.swaps.length
            ? table({
              caption: 'Swap-by-swap cost of bringing the selection to the floor',
              columns: [
                { key: 'out', label: 'Un-name', render: ({ row }) => row.out },
                { key: 'in', label: 'Name instead', render: ({ row }) => row.in },
                { key: 'ratio', label: 'Ratio', render: ({ row }) => row.ratio },
                { key: 'delta', label: 'Cost delta', render: ({ row }) => row.delta },
              ],
              rows: compliance.swaps.map((swap) => ({
                row: {
                  out: `${swap.outName} (${swap.outGroup})`,
                  in: `${swap.inName} (${swap.inGroup})`,
                  ratio: `${swap.ratioBefore} → ${swap.ratioAfter}`,
                  delta: `${swap.costDelta >= 0 ? '+' : ''}${money(swap.costDelta, currency)} · ${swap.capabilityGained >= 0 ? '+' : ''}${swap.capabilityGained} capability`,
                },
              })),
            })
            : null,
          h('p', { class: 'muted small' },
            `Composite exposure lost: ${compliance.scoreLoss}. Headcount is unchanged, so this is a different list rather than a smaller one — and the trade is written down where a reviewer can disagree with it rather than agreed in a corridor.`)),
  });

  const robustnessCard = card({
    title: 'Is this the answer, or the answer to my weights?',
    subtitle: reading.robustness.status === 'ok'
      ? `The same constrained problem re-solved under ${reading.robustness.draws} perturbed weightings`
      : 'Not computed',
    body: reading.robustness.status === 'ok'
      ? h('div', { class: 'view-stack' },
        h('div', { class: 'stat-grid' },
          stat({ label: 'Core', value: String(reading.robustness.core.length), hint: `Selected in ${TRANSITION_CONVENTIONS.stabilityCorePct}%+ of weightings`, tone: 'bad' }),
          stat({ label: 'Knife-edge', value: String(reading.robustness.knifeEdge.length), hint: `${TRANSITION_CONVENTIONS.stabilityKnifePct}–${TRANSITION_CONVENTIONS.stabilityCorePct}% — the weights decide`, tone: 'warn' }),
          stat({ label: 'Stable retention', value: String(reading.robustness.stableRetained.length), hint: `Below ${TRANSITION_CONVENTIONS.stabilityKnifePct}% — safe under any reasonable weighting`, tone: 'good' })),
        reading.robustness.knifeEdge.length
          ? h('div', null,
            h('h3', { class: 'subhead' }, 'Names your weight table is choosing'),
            h('ul', { class: 'list-plain stack-xs' },
              ...reading.robustness.knifeEdge
                .slice()
                .sort((a, b) => b.pct - a.pct)
                .map((entry) => h('li', null,
                  `${entry.row.name} — selected in ${entry.pct}% of weightings. ${entry.pct >= 50 ? 'Selected more often than not, which is not the same as selected for a reason.' : 'Retained more often than not, which is not the same as safe.'}`))))
          : h('p', null, 'No candidate sits on a knife edge: the plan is robust to plausible disagreement about the weights.'),
        h('p', { class: 'muted small' },
          reading.robustness.reason || 'Each draw multiplies every declared weight by an independent factor in [0.5, 1.5) and re-normalises. A criterion you set to zero stays zero, because perturbing it would model a decision you did not make.'))
      : h('p', { class: 'muted small' }, reading.robustness.reason),
  });

  return h('div', { class: 'view-stack' }, screenCard, complianceCard, robustnessCard);
}

function continuityPanel(ctx, program, reading) {
  const continuity = reading.continuity;
  const survivors = reading.survivors;
  const delegations = ctx.state.delegations || [];

  const blockerCard = continuity.blockers.length
    ? card({
      title: 'Not selectable: sole holders',
      subtitle: 'A person the workspace records as the only cover for a critical capability',
      body: h('div', { class: 'view-stack' },
        banner({ tone: 'bad', title: `${continuity.blockers.length} selected exit(s) would remove the only holder`, body: continuity.note }),
        table({
          caption: 'Selected exits who are the sole recorded steward of a critical dependency',
          columns: [
            { key: 'name', label: 'Person', render: ({ row }) => row.name },
            { key: 'reason', label: 'Why', render: ({ row }) => row.reason },
          ],
          rows: continuity.blockers.map((row) => ({ row: { name: row.name, reason: row.reason } })),
        })),
    })
    : null;

  const handoverCard = card({
    title: 'What leaves with them',
    subtitle: 'Derived from dependency stewardship, succession readiness, open cases, delegations and goals — not from a job title.',
    body: h('div', { class: 'view-stack' },
      continuity.atRisk.length
        ? table({
          caption: 'Proposed leavers with continuity risk and hand-over status',
          columns: [
            { key: 'name', label: 'Leaver', render: ({ row }) => row.name },
            { key: 'risk', label: 'Continuity risk', render: ({ row }) => row.risk },
            { key: 'what', label: 'At stake', render: ({ row }) => row.what },
            { key: 'task', label: 'Hand-over', render: ({ row }) => row.task },
          ],
          rows: continuity.atRisk.map((row) => {
            const marker = `[TRN-HANDOVER:${program.id}:${row.personId}]`;
            const task = delegations.find((entry) => entry && entry.personId === row.personId
              && typeof entry.support === 'string' && entry.support.includes(marker));
            return {
              row: {
                name: h('div', null, h('div', null, row.name), h('div', { class: 'muted small' }, row.benchScarce ? 'No ready-now bench' : `${row.readyNow} ready-now seat(s)`)),
                risk: h('div', null, `${row.riskScore}/100`, progressBar(row.riskScore, { thin: true, tone: row.riskScore >= 60 ? 'bad' : 'warn', label: `Continuity risk for ${row.name}` })),
                what: h('div', { class: 'muted small' },
                  row.soleStewardOf.length
                    ? `Sole steward: ${row.soleStewardOf.map((entry) => entry.label).join(', ')}`
                    : row.criticalDependencies.length
                      ? `Critical stewardship: ${row.criticalDependencies.map((entry) => entry.label).slice(0, 2).join(', ')}`
                      : `${row.openCases} case(s), ${row.openDelegations} delegation(s), ${row.openGoals} goal(s)`),
                task: task
                  ? h('div', null, badge('Owned hand-over', 'good'), h('div', { class: 'muted small' }, `Due ${task.dueOn || 'unset'}`))
                  : h('span', { class: 'muted small' }, 'Not yet opened — run the scan'),
              },
            };
          }),
        })
        : h('p', null, 'No proposed leaver carries a recorded knowledge risk above the convention. That is a property of the records, not a guarantee about the person: undocumented knowledge does not show up in any graph.'),
      h('p', { class: 'muted small' },
        'A hand-over obligation is opened by RULE-TRN-03 with a due date before the last working day. The gate is signed by a human; nothing here can tell you whether the successor truly understood.')),
  });

  const survivorCard = card({
    title: 'The people who stay',
    subtitle: 'The second wave of a reduction, measured from recorded ownership rather than from how anyone says they feel.',
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'stat-grid' },
        stat({ label: 'Median ownership', value: `${survivors.beforeMedian ?? '—'} → ${survivors.afterMedian ?? '—'}`, hint: 'Ownership units per retained person' }),
        stat({ label: `Above +${survivors.threshold}%`, value: String(survivors.flagged.length), hint: 'Retained people absorbing the biggest share', tone: survivors.flagged.length ? 'warn' : 'good' }),
        stat({ label: 'Modelled regretted departures', value: survivors.expectedDepartures ?? '—', hint: 'A three-term convention, frozen and scored later', tone: 'neutral' })),
      survivors.flagged.length
        ? table({
          caption: 'Retained people whose recorded ownership rises most',
          columns: [
            { key: 'name', label: 'Retained person', render: ({ row }) => row.name },
            { key: 'load', label: 'Ownership', render: ({ row }) => row.load },
            { key: 'risk', label: 'Modelled departure', render: ({ row }) => row.risk },
          ],
          rows: survivors.flagged.slice(0, 10).map((row) => ({
            row: {
              name: h('div', null, h('div', null, row.name), h('div', { class: 'muted small' }, row.highValue ? 'High-value retained' : 'Retained')),
              load: `${row.loadBefore} → ${row.loadAfter} (+${row.increasePct}%)`,
              risk: row.highValue ? `${row.departurePct}%` : h('span', { class: 'muted small' }, 'not scored'),
            },
          })),
        })
        : h('p', null, 'No retained person crosses the load convention on the recorded ownership.'),
      h('p', { class: 'muted small' }, survivors.note)),
  });

  return h('div', { class: 'view-stack' }, blockerCard, handoverCard, survivorCard);
}

function alternativesPanel(ctx, program, reading) {
  const options = reading.options;
  const currency = program.currency || 'USD';
  return h('div', { class: 'view-stack' },
    banner({
      tone: options.recommended ? 'good' : 'warn',
      title: options.recommended
        ? `One option dominates: ${options.options.find((option) => option.id === options.recommended)?.label}`
        : 'No option dominates — the trade is printed rather than picked',
      body: h('div', { class: 'view-stack' },
        h('p', null, options.tradeoff || options.note),
        h('p', { class: 'muted small' }, options.note)),
    }),
    h('div', { class: 'grid-cards' },
      ...options.options.map((option) => card({
        title: option.label,
        subtitle: option.caveat,
        className: option.id === options.recommended ? 'card-accent' : '',
        body: h('div', { class: 'view-stack' },
          h('div', { class: 'row-wrap' },
            option.onFrontier ? badge('Pareto frontier', 'good') : badge(option.available === false ? 'Not available' : 'Dominated or off-target', 'neutral'),
            option.meetsTarget === false ? badge(option.available === false ? 'no receiving role' : `misses the target by ${option.shortfallPct}%`, 'bad') : null),
          h('div', { class: 'stat-grid' },
            stat({ label: 'Exits achieved', value: String(option.headcount), hint: options.target ? `Target ${options.target}` : 'No target set', tone: option.meetsTarget === false ? 'bad' : 'good' }),
            stat({ label: 'Cash cost', value: money(option.cost, currency), hint: `${Math.round(option.costAboveBest * 100)}% above the cheapest option` }),
            stat({ label: 'Capability lost', value: `${option.capabilityLostPct}%`, hint: `${option.capabilityLost} units · ${Math.round(option.capabilityAboveBest * 100)}% above the gentlest` }),
            stat({ label: 'High performers lost', value: String(option.highPerformersLost), hint: `of ${options.highPerformerPool} in the pool` })),
          h('p', { class: 'muted small' }, option.framework)),
      }))),
    card({
      title: 'Why a voluntary offer is not a kinder version of the same plan',
      subtitle: 'Adverse selection, stated plainly',
      body: h('div', { class: 'view-stack' },
        h('p', null,
          'A volunteer compares the offer with their own outside option. Take-up is therefore highest where the outside option is best — which is exactly where the person is most marketable, most mobile and often strongest. The model above takes the most mobile people first and prices what that does to capability, so the comparison is between two different cohorts rather than two different moods.'),
        h('p', { class: 'muted small' },
          'The mobility input is a declared judgement per person, not a measured fact. Where it is unset, the model assumes the middle of the scale and the page says so. A voluntary programme can still be the right choice — it buys consent and speed — but it buys them with a selection you did not make.'),
        h('p', { class: 'muted small' },
          'Cash and capability are never converted into each other here, so there is no single score to rank. The comparison is Pareto dominance over the options that meet the target: a dominated option is worse on both terms, and everyone else is on the frontier with the trade printed between its ends.')),
    }));
}

function methodPanel(ctx, program, reading) {
  const settings = ctx.state.settings || {};
  const snapshot = reading.snapshot;
  const calibration = reading.calibration;
  return h('div', { class: 'view-stack' },
    card({
      title: 'Conventions in force',
      subtitle: 'Every one is a declared judgement. None is a legal opinion, and none was inferred from a record.',
      body: h('div', { class: 'kv-list' },
        kv('Notice', `${settings.transitionNoticeDays ?? TRANSITION_CONVENTIONS.noticeDays} days of pay in lieu`),
        kv('Severance', `${settings.transitionSeveranceMonthsPerYear ?? TRANSITION_CONVENTIONS.severanceMonthsPerYear} month(s) per year of service, capped at ${settings.transitionSeveranceCapMonths ?? TRANSITION_CONVENTIONS.severanceCapMonths} months`),
        kv('Selection ratio floor', String(settings.transitionImpactRatio ?? TRANSITION_CONVENTIONS.impactRatio)),
        kv('Group size floor', `${settings.transitionMinGroupSize ?? TRANSITION_CONVENTIONS.minGroupSize} people`),
        kv('Survivor load threshold', `+${settings.transitionSurvivorLoadPct ?? TRANSITION_CONVENTIONS.survivorLoadPct}% recorded ownership`),
        kv('Prediction horizon', `${settings.transitionHorizonDays ?? TRANSITION_CONVENTIONS.horizonDays} days from the effective date`),
        kv('Weight ensemble', `${TRANSITION_CONVENTIONS.ensembleDraws} draws, deterministic per programme`),
        kv('Replacement cost', `${settings.compReplacementMultiplier ?? 0.5}× annual pay, +${Math.round(TRANSITION_CONVENTIONS.benchScarcityUplift * 100)}% when no ready-now bench exists`),
        kv('Calibration floor', `${TRANSITION_CONVENTIONS.calibrationMin} resolved predictions`)),
    }),
    card({
      title: 'Frameworks this module actually implements',
      subtitle: 'Named, used, and printed — not cited as decoration',
      body: h('ul', { class: 'list-plain stack-xs' },
        h('li', null, h('strong', null, 'Four-fifths rule with Wilson (1927) intervals: '), 'the screen runs over the selection decision, shows an interval on every group rate, refuses to compare groups below the size floor, and states that it is a screen rather than a finding.'),
        h('li', null, h('strong', null, 'Knapsack construction with swap repair and a fractional-relaxation bound: '), 'the optimizer prints how far from the best conceivable plan it landed instead of calling a greedy result optimal.'),
        h('li', null, h('strong', null, 'Model-uncertainty sensitivity (a 240-draw weight ensemble): '), 'each candidate gets the share of plausible weightings that select them, so a name chosen by a coefficient is visible as one.'),
        h('li', null, h('strong', null, 'Akerlof (1970) adverse selection and Rothschild–Stiglitz (1976) screening: '), 'a voluntary offer is priced as a different cohort rather than as a gentler process.'),
        h('li', null, h('strong', null, 'Savage (1951) minimax regret: '), 'alternatives are compared on their worst relative loss in cash and in capability, and the two are never converted into one another.'),
        h('li', null, h('strong', null, 'Nonaka & Takeuchi (1995) tacit knowledge, and Bus-factor concentration: '), 'continuity risk is read from recorded stewardship rather than assumed from seniority.'),
        h('li', null, h('strong', null, 'Brier (1950) skill scoring over frozen predictions: '), 'the survivor convention is scored against its own base rate, withheld below five outcomes, and its false positives are recorded as well as its hits.')),
    }),
    card({
      title: 'What this module will not claim',
      subtitle: 'The limits, printed where the numbers are',
      body: h('ul', { class: 'list-plain stack-xs' },
        h('li', null, 'It stores no protected characteristic. The screen runs on an organisational dimension or on opaque codes you supply, so it cannot perform the statutory analysis a legal team performs.'),
        h('li', null, 'It is not legal advice. Notice, consultation and severance duties vary by jurisdiction, contract and works council; the conventions here are yours to declare.'),
        h('li', null, 'It does not predict any individual’s departure. The survivor model is a three-term convention whose only claim is that it can be scored later.'),
        h('li', null, 'It does not score people’s worth. Capability value is the operational value recorded in this workspace’s own dependency, succession and ownership records.'),
        h('li', null, 'It never selects anyone. It computes a recommendation, shows its sensitivity, and requires a human to mark every row.')),
    }),
    card({
      title: 'Frozen snapshot',
      subtitle: snapshot ? `Taken ${formatDate(snapshot.on || '')} · cannot be edited` : 'Nothing is frozen yet',
      body: snapshot
        ? h('div', { class: 'view-stack' },
          h('div', { class: 'kv-list' },
            kv('Named exits', String(snapshot.achieved.named)),
            kv('Cash cost', money(snapshot.achieved.cashCost, snapshot.currency)),
            kv('Unpriced exits', String(snapshot.achieved.unpriced)),
            kv('Selection ratio', snapshot.screen?.status === 'ok' ? `${snapshot.screen.ratio} vs ${snapshot.screen.threshold}${snapshot.screen.flagged ? ' (flagged)' : ''}` : 'not computable'),
            kv('Weight robustness', `${snapshot.stability.core} core / ${snapshot.stability.knifeEdge} knife-edge over ${snapshot.stability.draws} draws`),
            kv('Continuity', `${snapshot.continuity.blockers} blocker(s), ${snapshot.continuity.atRisk} hand-over(s)`),
            kv('Survivor load', `${snapshot.survivors.beforeMedian ?? '—'} → ${snapshot.survivors.afterMedian ?? '—'}; ${snapshot.survivors.flagged} flagged`),
            kv('Frozen predictions', `${snapshot.predictions.length} (${snapshot.predictions.filter((row) => row.selected).length} selected, ${snapshot.predictions.filter((row) => !row.selected).length} retained)`),
            kv('Resolved', `${reading.outcomes.length}`)),
          h('p', { class: 'muted small' },
            'Reopening the programme does not rewrite this object; it is superseded only by a new finalization. Resolved outcomes are facts and are never discarded.'))
        : h('p', { class: 'muted small' }, 'Finalizing freezes the cost, the screen, the stability counts, the continuity reading, the survivor model and every per-person prediction in the same transaction as the status change.'),
    }),
    card({
      title: 'Survivor convention calibration',
      subtitle: calibration.measurable
        ? `${calibration.n} resolved prediction(s)`
        : 'Withheld below the sample floor',
      body: h('div', { class: 'view-stack' },
        calibration.measurable
          ? h('div', { class: 'stat-grid' },
            stat({ label: 'Brier', value: String(calibration.brier), hint: `Base rate ${calibration.basePct}%`, tone: calibration.skill !== null && calibration.skill > 0 ? 'good' : 'warn' }),
            stat({ label: 'Base Brier', value: String(calibration.baseBrier), hint: 'Everyone at the observed rate' }),
            stat({ label: 'Skill', value: calibration.skill === null ? '—' : String(calibration.skill), hint: 'Positive beats the base rate', tone: calibration.skill !== null && calibration.skill > 0 ? 'good' : 'warn' }))
          : null,
        h('p', { class: 'muted small' }, calibration.note)),
    }),
    card({
      title: 'History',
      subtitle: 'Append-only, and the reason a reviewer can see how the plan changed',
      body: (program.history || []).length
        ? h('ul', { class: 'timeline' },
          ...program.history.slice().reverse().map((entry) => h('li', null,
            h('div', { class: 'muted small' }, `${entry.at.slice(0, 10)} · ${entry.type}`),
            h('div', null, entry.summary))))
        : emptyState({ title: 'No history yet' }),
    }),
    card({
      title: 'Programme actions',
      subtitle: 'Irreversible or destructive actions confirm first',
      body: h('div', { class: 'row-wrap' },
        h('button', {
          class: 'btn btn-ghost btn-sm',
          type: 'button',
          onClick: () => {
            const text = transitionBrief(ctx.state, ctx.now instanceof Date ? ctx.now : new Date());
            openModal({
              title: 'Copy the transition brief',
              body: h('textarea', { readOnly: true, rows: '18', 'aria-label': 'Workforce transition brief' }, text),
              footer: [h('button', {
                class: 'btn btn-ghost',
                type: 'button',
                onClick: () => downloadText({ filename: 'leados-workforce-transition.txt', text, mime: 'text/plain' }),
              }, 'Download')],
            });
          },
        }, 'Copy the board brief'),
        program.status !== 'finalized'
          ? h('button', {
            class: 'btn btn-ghost btn-sm',
            type: 'button',
            onClick: () => {
              const result = ctx.api.reopenTransitionProgram(program.id);
              if (!result.ok) { toast(result.error, 'bad'); return; }
              toast('Reopened. The frozen snapshot is kept until the next finalization supersedes it.', 'good');
              ctx.refresh();
            },
          }, 'Reopen')
          : null,
        program.status !== 'abandoned' && program.status !== 'finalized'
          ? h('button', {
            class: 'btn btn-ghost btn-sm',
            type: 'button',
            onClick: () => confirmDialog({
              title: `Abandon “${program.label}”?`,
              message: 'The rows, the snapshot and the history stay readable as a record of a plan that was not executed. Nothing is deleted.',
              confirmLabel: 'Abandon the programme',
              danger: true,
              onConfirm: () => {
                const result = ctx.api.abandonTransitionProgram(program.id);
                if (!result.ok) toast(result.error, 'bad');
                else toast('Programme abandoned. The record stays readable.', 'neutral');
                ctx.refresh();
              },
            }),
          }, 'Abandon')
          : null,
        h('button', {
          class: 'btn btn-ghost btn-sm',
          type: 'button',
          onClick: () => confirmDialog({
            title: `Delete “${program.label}”?`,
            message: 'This deletes the programme, its rows, its frozen snapshot and every typed link from it. The decisions and delegations the rules already created stay on the record, because they are real work other people own.',
            confirmLabel: 'Delete the programme',
            danger: true,
            onConfirm: () => {
              const result = ctx.api.deleteTransitionProgram(program.id);
              if (!result.ok) toast(result.error, 'bad');
              else toast('Programme deleted.', 'neutral');
              ctx.navigate('#/transition');
            },
          }),
        }, 'Delete the programme')),
    }));
}

/* -------------------------------------------------------------------- render */

export function renderTransition(ctx) {
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now);
  const programs = ctx.state.transitionPrograms || [];
  const requested = ctx.query?.get?.('program') || '';
  const fallback = programs.find((row) => row.status === 'draft' || row.status === 'decided')
    || [...programs].sort((a, b) => String(b.effectiveOn).localeCompare(String(a.effectiveOn)))[0]
    || null;
  const program = programs.find((row) => row.id === requested) || fallback;
  const requestedTab = ctx.query?.get?.('panel') || 'plan';
  const tab = ['plan', 'exposure', 'continuity', 'alternatives', 'method'].includes(requestedTab) ? requestedTab : 'plan';

  // The weight ensemble and the compliance search are the expensive parts: at
  // the 300-row cap a full read costs roughly 600 ms. Only the two panels that
  // print them pay for it, so opening the alternatives or the method card stays
  // on the fast path and the page never blocks the main thread for a number it
  // is not showing.
  const heavy = tab === 'plan' || tab === 'exposure';
  const reading = program ? transitionReading(ctx.state, program, now, { depth: heavy ? 'full' : 'fast' }) : null;

  const picker = programs.length > 1
    ? h('div', { class: 'stack-xs' },
      h('label', { for: 'transition-program-select' }, 'Programme'),
      h('select', {
        id: 'transition-program-select',
        onChange: (event) => ctx.navigate(`#/transition?program=${encodeURIComponent(event.target.value)}`),
      },
      ...programs.map((row) => h('option', { value: row.id, ...(program && row.id === program.id ? { selected: 'selected' } : {}) },
        `${row.label} · ${TRANSITION_STATUS_LABELS[row.status] || row.status}`))))
    : null;

  const header = pageHeader({
    eyebrow: 'People · Schema v52',
    title: 'Workforce transition',
    subtitle: 'Who leaves, what it costs, what walks out with them, and what the people who stay will do about it — with the sensitivity of the selection printed rather than hidden.',
    actions: [
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openProgramDialog(ctx) }, 'Declare a programme'),
      program
        ? h('button', {
          class: 'btn btn-ghost',
          type: 'button',
          onClick: () => {
            const result = ctx.api.scanTransition(program.id);
            if (!result.ok) { toast(result.error, 'bad'); return; }
            toast(result.changed
              ? 'Scan complete — screen, hand-over and survivor obligations were reconciled'
              : 'Scan complete: nothing needed opening', result.changed ? 'good' : 'neutral');
            ctx.refresh();
          },
        }, 'Scan for obligations')
        : null,
      h('a', { class: 'btn btn-ghost', href: '#/merit' }, 'Merit & pay equity'),
    ],
    meta: program ? badge(`${TRANSITION_STATUS_LABELS[program.status] || program.status}`, program.status === 'finalized' ? 'good' : 'neutral') : badge('No programme', 'neutral'),
  });

  if (!program) {
    return h('div', { class: 'page', 'data-testid': 'transition-page' },
      header,
      banner({
        tone: 'info',
        title: 'A reduction is a decision surface, not a spreadsheet',
        body: 'This module prices the exits, screens the selection, derives what capability would leave from the dependency and succession records already in this workspace, and prices the alternatives — including the one nobody costs, a voluntary offer that selects a different cohort than the criteria would.',
      }),
      emptyState({
        title: 'No transition programme declared',
        body: 'Declare the target, the criteria weights and the comparison dimension first. Then the pool, then the names. Each step is recorded separately because they are different decisions.',
        action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openProgramDialog(ctx) }, 'Declare a programme'),
      }));
  }

  const stats = h('div', { class: 'stat-grid' },
    stat({
      label: 'Named exits',
      value: `${reading.plan.proposed.length} / ${reading.plan.target}`,
      hint: reading.plan.shortfall ? `${reading.plan.shortfall} unnamed` : 'target met',
      tone: reading.plan.shortfall ? 'warn' : 'good',
    }),
    stat({
      label: 'Cash cost',
      value: money(reading.plan.cost, program.currency),
      hint: reading.plan.costCeiling ? `ceiling ${money(reading.plan.costCeiling, program.currency)}` : 'no declared ceiling',
      tone: reading.plan.costCeilingBreached ? 'bad' : 'neutral',
    }),
    stat({
      label: 'Capability leaving',
      value: pct(reading.plan.capabilityLostPct, 1),
      hint: `${reading.continuity.atRisk.length} hand-over obligation(s)`,
      tone: reading.continuity.atRisk.length ? 'warn' : 'good',
    }),
    stat({
      label: 'Selection ratio',
      value: reading.screen.status === 'ok' ? String(reading.screen.ratio) : '—',
      hint: reading.screen.status === 'ok'
        ? `floor ${reading.screen.threshold}${reading.screen.flagged ? ' · below' : ' · clears'}`
        : 'not computable on this pool',
      tone: reading.screen.status !== 'ok' ? 'warn' : reading.screen.flagged ? 'bad' : 'good',
    }));

  const flagsCard = reading.flags.length
    ? card({
      title: `${reading.flags.length} finding(s) before this plan can be defended`,
      subtitle: 'Each one names the mechanism and the price, not a verdict on a person',
      body: h('ul', { class: 'list-plain stack-xs' },
        ...reading.flags
          .slice()
          .sort((a, b) => b.severity - a.severity)
          .map((flag) => h('li', null,
            badge(flag.id, flag.severity >= 4 ? 'bad' : flag.severity >= 3 ? 'warn' : 'neutral'),
            ' ',
            flag.detail))),
    })
    : null;

  const tabsRow = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Transition sections' },
    ...[
      { key: 'plan', label: 'Plan & process' },
      { key: 'exposure', label: 'Exposure & compliance' },
      { key: 'continuity', label: 'Continuity & survivors' },
      { key: 'alternatives', label: 'Alternatives' },
      { key: 'method', label: 'Method & settlement' },
    ].map((item) => h('button', {
      class: `tab ${item.key === tab ? 'is-active' : ''}`,
      type: 'button',
      role: 'tab',
      'aria-selected': item.key === tab ? 'true' : 'false',
      onClick: () => ctx.navigate(`#/transition?program=${encodeURIComponent(program.id)}&panel=${item.key}`),
    }, item.label)));

  const panel = tab === 'exposure'
    ? exposurePanel(ctx, program, reading)
    : tab === 'continuity'
      ? continuityPanel(ctx, program, reading)
      : tab === 'alternatives'
        ? alternativesPanel(ctx, program, reading)
        : tab === 'method'
          ? methodPanel(ctx, program, reading)
          : planPanel(ctx, program, reading);

  const decisionBar = h('div', { class: 'row-wrap' },
    program.status !== 'finalized'
      ? h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.decideTransition(program.id);
          if (!result.ok) { toast(result.error, 'bad'); return; }
          toast('Plan marked decided. The screen decision, hand-over obligations and survivor prompts are open.', 'good');
          ctx.refresh();
        },
      }, 'Mark the plan decided')
      : null,
    program.status !== 'finalized'
      ? h('button', {
        class: 'btn btn-ghost',
        type: 'button',
        onClick: () => confirmDialog({
          title: `Finalize “${program.label}”?`,
          message: 'This freezes the cost, the selection screen, the weight-robustness counts, the continuity reading and every per-person prediction, and opens one dated outcome review plus one tracking task. It cannot be edited afterwards; reopening keeps the snapshot until a new finalization supersedes it.',
          confirmLabel: 'Finalize the programme',
          onConfirm: () => {
            const result = ctx.api.finalizeTransitionProgram(program.id);
            if (!result.ok) { toast(result.error, 'bad'); return; }
            toast('Frozen. The prediction is now a test rather than a memory.', 'good');
            ctx.refresh();
          },
        }),
      }, 'Finalize and freeze the prediction')
      : null,
    program.status === 'finalized'
      ? badge('Predictions frozen', 'good')
      : h('span', { class: 'muted small' },
        `Effective ${formatDate(program.effectiveOn)} · ${reading.timeline.daysToEffective >= 0 ? `${reading.timeline.daysToEffective} day(s) away` : `${Math.abs(reading.timeline.daysToEffective)} day(s) ago`}`));

  return h('div', { class: 'page', 'data-testid': 'transition-page' },
    header,
    picker,
    banner({
      tone: reading.continuity.blockers.length || reading.screen.flagged ? 'bad' : reading.flags.length ? 'warn' : 'info',
      title: reading.continuity.blockers.length
        ? 'A selected exit would remove the only recorded holder of a critical capability'
        : reading.screen.status === 'ok' && reading.screen.flagged
          ? `The selection screen is below the floor at ${reading.screen.ratio}`
          : `“${program.label}” — ${TRANSITION_KIND_LABELS[program.kind] || program.kind} effective ${formatDate(program.effectiveOn)}`,
      body: reading.continuity.blockers.length
        ? reading.continuity.note
        : 'Weights are a judgement, so the module re-solves the same problem under 240 perturbed weightings and marks every name whose selection depends on the table rather than the record. No protected characteristic is stored, and nothing here is legal advice.',
    }),
    stats,
    flagsCard,
    tabsRow,
    panel,
    decisionBar,
    card({
      title: 'Notes',
      subtitle: 'Stored locally. Never exported to CSV and never included in a brief.',
      body: h('div', { class: 'view-stack' },
        program.notes ? h('p', null, program.notes) : h('p', { class: 'muted small' }, 'No notes recorded.'),
        h('p', { class: 'muted small' },
          `Currency ${program.currency} · comparison ${TRANSITION_DIMENSION_LABELS[program.dimension] || program.dimension} · ${reading.facts.missingPay} of ${reading.facts.rows.length} candidate(s) have no recorded pay · ${reading.facts.missingRating} have no completed review. Missing values are printed as gaps, never as zeroes.`)),
    }),
  );
}
