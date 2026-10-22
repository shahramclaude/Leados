// Round-robin rep rotation.
//
// This is the entire "rotation" capability that exists today: a deterministic
// round-robin over the tenant's active reps, keyed off the id of the rep who
// last received a lead. There is no load-balancing by capacity, skill match,
// or territory yet (see docs/explanations/architecture.md roadmap section).

export interface RotationRep {
  id: number;
  active: boolean;
}

/**
 * Returns the next rep in rotation order given the currently active reps and
 * the id of the rep who was assigned last (or undefined/null if none yet).
 * Reps are ordered by `id` ascending so rotation order is stable and does not
 * depend on array ordering from the caller.
 *
 * Returns `undefined` if there are no active reps to assign to.
 */
export function nextRepInRotation(
  reps: RotationRep[],
  lastRepId: number | null | undefined,
): RotationRep | undefined {
  const active = [...reps].filter((rep) => rep.active).sort((a, b) => a.id - b.id);
  if (active.length === 0) return undefined;

  if (lastRepId == null) return active[0];

  const lastIndex = active.findIndex((rep) => rep.id === lastRepId);
  if (lastIndex === -1) return active[0];

  return active[(lastIndex + 1) % active.length];
}
