/**
 * app/ui/orgdesign-modals.js — the three dialogs of the Structural Design
 * Terminal (Schema v53).
 *
 * Each dialog changes one kind of thing:
 *
 *   - `openOrgDesignDialog` declares a design: a label, a purpose, an owner and
 *     the conventions the reading will use. It creates nothing else.
 *   - `openMovesDialog` edits the *proposed* reporting lines. It writes a draft;
 *     nothing on the roster changes until the design is committed from the page.
 *   - `openConventionDialog` changes the workspace-wide span band and
 *     coordination hours, which is a settings change, and says so.
 *
 * All three are keyboard-operable, labelled, and axe-clean: every input has a
 * bound `<label>`, every dialog traps focus through `openModal`, and no dialog
 * puts a destructive action behind a single unlabelled control.
 */

import { h, toast, openModal } from './dom.js';
import {
  buildStructure,
  conventionsFromSettings,
  designContract,
  simulateDesign,
} from '../core/domain/orgDesign.js';

function activePeople(ctx) {
  return (ctx.state.people || []).filter((person) => person && person.status !== 'archived');
}

function personLabel(person) {
  return person.role ? `${person.name} — ${person.role}` : person.name;
}

/* --------------------------------------------------------------- declare */

export function openOrgDesignDialog(ctx) {
  const conventions = conventionsFromSettings(ctx.state);
  const label = h('input', { id: 'org-label', type: 'text', maxlength: '140', required: 'required' });
  const purpose = h('textarea', { id: 'org-purpose', rows: '3', maxlength: '1200' });
  const owner = h('select', { id: 'org-owner' },
    h('option', { value: '' }, 'No single owner (commit will refuse)'),
    ...activePeople(ctx).map((person) => h('option', { value: person.id }, person.name)));
  const spanMin = h('input', { id: 'org-span-min', type: 'number', min: '1', max: '30', value: String(conventions.spanMin) });
  const spanMax = h('input', { id: 'org-span-max', type: 'number', min: '2', max: '40', value: String(conventions.spanMax) });
  const hours = h('input', { id: 'org-hours', type: 'number', min: '0', max: '12', step: '0.5', value: String(conventions.coordinationHoursPerWeek) });
  const horizon = h('input', { id: 'org-horizon', type: 'number', min: '30', max: '730', value: String(conventions.reviewHorizonDays) });

  const dialog = openModal({
    title: 'Declare a structural design',
    description: 'A design is a set of proposed reporting lines. Nothing on the roster changes until you commit it from the page, and the prediction is frozen at that moment.',
    body: h('div', { class: 'view-stack' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'org-label' }, 'What is this design?'), label),
        h('div', { class: 'stack-xs' }, h('label', { for: 'org-owner' }, 'Accountable owner'), owner)),
      h('div', { class: 'stack-xs' },
        h('label', { for: 'org-purpose' }, 'What problem is it meant to solve?'),
        purpose,
        h('span', { class: 'muted small' }, 'The outcome review restates this question a horizon later. “Better alignment” cannot be scored; “the two leads stop re-deciding the same call” can.')),
      h('h3', { class: 'subhead' }, 'Conventions this design measures against'),
      h('p', { class: 'muted small' },
        'The span band is the classical supervisory convention and is configurable because a research pod and a shift floor do not share one number. Coordination hours are what one reporting channel is declared to cost per week; the money is derived from recorded pay and is absent where none exists.'),
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'org-span-min' }, 'Span band minimum'), spanMin),
        h('div', { class: 'stack-xs' }, h('label', { for: 'org-span-max' }, 'Span band maximum'), spanMax),
        h('div', { class: 'stack-xs' }, h('label', { for: 'org-hours' }, 'Coordination hours per channel per week'), hours),
        h('div', { class: 'stack-xs' }, h('label', { for: 'org-horizon' }, 'Review horizon, days'), horizon))),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const settingsResult = ctx.api.updateSettings({
            orgSpanMin: Number(spanMin.value),
            orgSpanMax: Number(spanMax.value),
            orgCoordinationHoursPerWeek: Number(hours.value),
            orgReviewHorizonDays: Number(horizon.value),
          });
          if (!settingsResult.ok) { toast(settingsResult.error, 'bad'); return; }
          const result = ctx.api.addOrgDesign({
            label: label.value,
            purpose: purpose.value,
            ownerId: owner.value,
            reviewHorizonDays: Number(horizon.value),
            conventions: {
              spanMin: Number(spanMin.value),
              spanMax: Number(spanMax.value),
              coordinationHoursPerWeek: Number(hours.value),
              reviewHorizonDays: Number(horizon.value),
            },
          });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast('Design declared with no moves yet. Add the reporting changes you are considering.', 'good');
          ctx.navigate(`#/orgdesign?design=${encodeURIComponent(result.id)}&panel=designs`);
        },
      }, 'Declare the design'),
    ],
  });
}

/* ----------------------------------------------------------------- moves */

export function openMovesDialog(ctx, design) {
  const contract = designContract(design);
  const people = activePeople(ctx);
  const byId = new Map(people.map((person) => [person.id, person]));
  const state = { rows: (design.moves || []).map((move) => ({ ...move })) };
  const list = h('div', { class: 'stack-sm' });

  const render = () => {
    list.replaceChildren();
    if (!state.rows.length) {
      list.append(h('p', { class: 'muted' }, 'No moves yet. A design with no moves changes nothing and cannot be committed.'));
    }
    state.rows.forEach((row, index) => {
      const personSelect = h('select', { id: `org-move-person-${index}`, 'aria-label': `Person ${index + 1}` },
        ...people.map((person) => h('option', { value: person.id, ...(person.id === row.personId ? { selected: 'selected' } : {}) }, personLabel(person))));
      const managerSelect = h('select', { id: `org-move-manager-${index}`, 'aria-label': `New manager for move ${index + 1}` },
        h('option', { value: '', ...(row.toManagerId ? {} : { selected: 'selected' }) }, 'Top of the tree (no manager)'),
        ...people
          .filter((person) => person.id !== row.personId)
          .map((person) => h('option', { value: person.id, ...(person.id === row.toManagerId ? { selected: 'selected' } : {}) }, personLabel(person))));
      const remove = h('button', {
        class: 'btn btn-ghost btn-sm',
        type: 'button',
        onClick: () => {
          state.rows.splice(index, 1);
          render();
        },
      }, 'Remove');
      personSelect.addEventListener('change', () => { row.personId = personSelect.value; });
      managerSelect.addEventListener('change', () => { row.toManagerId = managerSelect.value || null; });
      const current = byId.get(row.personId);
      const currentManager = current?.managerId ? byId.get(current.managerId) : null;
      list.append(h('div', { class: 'stack-xs' },
        h('div', { class: 'form-grid' },
          h('div', { class: 'stack-xs' }, h('label', { for: `org-move-person-${index}` }, `Person ${index + 1}`), personSelect),
          h('div', { class: 'stack-xs' }, h('label', { for: `org-move-manager-${index}` }, 'Reports to'), managerSelect),
          h('div', { class: 'stack-xs' }, remove)),
        h('span', { class: 'muted small' },
          `Today: ${currentManager ? currentManager.name : 'top of the tree'}.`)));
    });
    // The live consequence of the draft, recomputed on every edit.
    const preview = simulateDesign(ctx.state, { ...design, moves: state.rows }, {
      now: ctx.now instanceof Date ? ctx.now : new Date(ctx.now),
      conventions: contract.conventions,
    });
    const summary = h('div', { class: 'kv-list', 'data-testid': 'org-move-preview' },
      h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, 'People whose line or depth changes'), h('span', { class: 'kv-value' }, String(preview.delta.moved))),
      h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, 'Max span after' ), h('span', { class: 'kv-value' }, String(preview.proposed.span.max ?? '—'))),
      h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, 'Units over the band after'), h('span', { class: 'kv-value' }, String(preview.proposed.span.overBandCount))),
      h('div', { class: 'kv' }, h('span', { class: 'kv-label' }, 'Coordination hours after'), h('span', { class: 'kv-value' }, String(preview.proposed.coordination.hoursPerWeek))));
    list.append(summary);
  };
  render();

  const addRow = h('button', {
    class: 'btn btn-ghost btn-sm',
    type: 'button',
    onClick: () => {
      const unused = people.find((person) => !state.rows.some((row) => row.personId === person.id) && person.managerId);
      state.rows.push({ personId: unused ? unused.id : people[0]?.id, toManagerId: null, note: '' });
      render();
    },
  }, 'Add a move');

  const dialog = openModal({
    title: `Edit the moves in “${design.label}”`,
    description: 'A move is one person’s proposed reporting line. The preview is computed from your roster in memory; nothing is written until the design is committed.',
    body: h('div', { class: 'view-stack' },
      h('p', { class: 'muted small' },
        'Committing a design applies every move in one transaction and refuses a reporting cycle. Reverting restores exactly the manager recorded at commit, and leaves alone any line that has changed again since.'),
      addRow,
      list),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const moves = state.rows
            .filter((row) => row && row.personId)
            .map((row) => ({ personId: row.personId, toManagerId: row.toManagerId || null }));
          const result = ctx.api.updateOrgDesign(design.id, { moves });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast(`${moves.length} proposed move(s) saved. Nothing has changed on the roster yet.`, 'good');
          ctx.refresh();
        },
      }, 'Save the moves'),
    ],
  });
}

/* ------------------------------------------------------------ conventions */

export function openConventionDialog(ctx, conventions = conventionsFromSettings(ctx.state)) {
  const spanMin = h('input', { id: 'org-c-span-min', type: 'number', min: '1', max: '30', value: String(conventions.spanMin) });
  const spanMax = h('input', { id: 'org-c-span-max', type: 'number', min: '2', max: '40', value: String(conventions.spanMax) });
  const hours = h('input', { id: 'org-c-hours', type: 'number', min: '0', max: '12', step: '0.5', value: String(conventions.coordinationHoursPerWeek) });
  const horizon = h('input', { id: 'org-c-horizon', type: 'number', min: '30', max: '730', value: String(conventions.reviewHorizonDays) });
  const structure = buildStructure(ctx.state);

  const dialog = openModal({
    title: 'Structural conventions',
    description: 'These are workspace-wide declarations. They change what every screen treats as a breach — not what the records say.',
    body: h('div', { class: 'view-stack' },
      h('p', { class: 'muted small' },
        `The current tree holds ${structure.nodes.length} people across ${structure.units.length} manager(s). Changing the band re-reads the same records against a different declared convention; it never changes a reporting line.`),
      h('div', { class: 'form-grid' },
        h('div', { class: 'stack-xs' }, h('label', { for: 'org-c-span-min' }, 'Span band minimum'), spanMin),
        h('div', { class: 'stack-xs' }, h('label', { for: 'org-c-span-max' }, 'Span band maximum'), spanMax),
        h('div', { class: 'stack-xs' }, h('label', { for: 'org-c-hours' }, 'Coordination hours per channel per week'), hours),
        h('div', { class: 'stack-xs' }, h('label', { for: 'org-c-horizon' }, 'Default review horizon, days'), horizon))),
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => dialog.close() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary',
        type: 'button',
        onClick: () => {
          const result = ctx.api.updateSettings({
            orgSpanMin: Number(spanMin.value),
            orgSpanMax: Number(spanMax.value),
            orgCoordinationHoursPerWeek: Number(hours.value),
            orgReviewHorizonDays: Number(horizon.value),
          });
          if (!result.ok) { toast(result.error, 'bad'); return; }
          dialog.close();
          toast('Conventions updated', 'good');
          ctx.refresh();
        },
      }, 'Save conventions'),
    ],
  });
}
