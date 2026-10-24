/**
 * app/ui/options.js — option lists for select fields.
 *
 * Kept separate from schema.js because these are presentation concerns (which
 * records are offered, and in what order) rather than data model.
 */

import { LEVEL_LABELS } from '../core/schema.js';

/**
 * Active people, alphabetical, as {value,label} pairs.
 * Accepts either the full app state or a plain array of people, because views
 * already hold slices while the modals hold the store.
 */
export function personOptions(source, { includeArchived = false } = {}) {
  const people = Array.isArray(source) ? source : source?.people || [];
  return people
    .filter((p) => includeArchived || p.status !== 'archived')
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({ value: p.id, label: p.role ? `${p.name} — ${p.role}` : p.name }));
}

/** Levels, with the schema's human labels. */
export function levelOptions() {
  return Object.entries(LEVEL_LABELS).map(([value, label]) => ({ value, label }));
}

/** Active goals, as options. Team-level goals have no owner. */
export function goalOptions(state) {
  return (state.goals || [])
    .filter((g) => g.status === 'active')
    .map((g) => ({ value: g.id, label: g.title }));
}

/** Active growth plans, labelled by person. */
export function growthPlanOptions(state) {
  const byId = new Map((state.people || []).map((p) => [p.id, p]));
  return (state.growthPlans || [])
    .filter((p) => p.status === 'active')
    .map((p) => ({
      value: p.id,
      label: `${byId.get(p.personId)?.name || 'Unknown'} — ${p.goal || 'growth plan'}`,
    }));
}

/**
 * Seats that could plausibly be a successor. Used only to build a picker, so a
 * missing name degrades to a label rather than throwing.
 */
export function successorOptions(state, seats = []) {
  const taken = new Set(seats.map((s) => s.personId));
  return (state.people || [])
    .filter((p) => p.status !== 'archived' && !taken.has(p.id))
    .map((p) => ({ value: p.id, label: p.name }));
}
