/** Validated, explicitly supplied response context for a confirmed Watch alert.
 * No estimates, ratings, owners, or stakeholders are inferred from a signal.
 * This is pure domain validation; neither audit events nor typed links carry it.
 */
function optionalId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function triple(raw, label) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const values = ['optimistic', 'mostLikely', 'pessimistic'].map((key) => input[key]);
  const present = values.map((value) => value !== null && value !== undefined && String(value).trim() !== '');
  if (!present.some(Boolean)) return { value: null };
  if (!present.every(Boolean)) return { error: `Enter all three ${label} estimates or leave them all blank.` };
  const numbers = values.map(Number);
  if (numbers.some((value) => !Number.isFinite(value) || value < 0 || value > 1e12)
    || numbers[0] > numbers[1] || numbers[1] > numbers[2]) {
    return { error: `${label} estimates must be non-negative, finite, and ordered optimistic ≤ most likely ≤ pessimistic.` };
  }
  return { value: { optimistic: numbers[0], mostLikely: numbers[1], pessimistic: numbers[2] } };
}

/** `repairReferences` is for loading a workspace after its referenced records
 * were deleted. It clears just those references, not the recorded estimates.
 */
export function validateWatchResponse(raw, state, { repairReferences = false } = {}) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  let ownerId = optionalId(input.ownerId);
  let goalId = optionalId(input.goalId);
  let stakeholderId = optionalId(input.stakeholderId);
  const check = (id, records, eligible, label) => {
    if (!id) return null;
    if ((records || []).some((record) => record.id === id && eligible(record))) return null;
    return `The selected ${label} is no longer available.`;
  };
  const ownerError = check(ownerId, state?.people, (p) => p.status === 'active', 'owner');
  const goalError = check(goalId, state?.goals, (g) => g.status === 'active', 'goal');
  const stakeholderError = check(stakeholderId, state?.stakeholders, (s) => s.status === 'active', 'stakeholder');
  if (!repairReferences && (ownerError || goalError || stakeholderError)) {
    return { ok: false, error: ownerError || goalError || stakeholderError };
  }
  if (ownerError) ownerId = '';
  if (goalError) goalId = '';
  if (stakeholderError) stakeholderId = '';

  const impact = triple(input.financial, 'financial impact');
  const capacity = triple(input.capacity, 'capacity impact');
  if (impact.error || capacity.error) return { ok: false, error: impact.error || capacity.error };
  const currency = String(input.financial?.currency || '').trim().toUpperCase();
  if (impact.value && !/^[A-Z]{3}$/.test(currency)) {
    return { ok: false, error: 'Enter a three-letter currency code for the financial estimate.' };
  }
  const fmeaInput = input.fmea && typeof input.fmea === 'object' ? input.fmea : {};
  const rawRatings = ['severity', 'probability', 'detectability'].map((key) => fmeaInput[key]);
  const ratingPresent = rawRatings.map((value) => value !== null && value !== undefined && String(value).trim() !== '');
  let fmea = null;
  if (ratingPresent.some(Boolean)) {
    const ratings = rawRatings.map(Number);
    if (!ratingPresent.every(Boolean) || ratings.some((value) => !Number.isInteger(value) || value < 1 || value > 10)) {
      return { ok: false, error: 'Enter all three FMEA ratings as whole numbers from 1 to 10, or leave all three blank.' };
    }
    fmea = { severity: ratings[0], probability: ratings[1], detectability: ratings[2] };
  }
  // Existing case valuation interprets FMEA occurrence as a probability. Do
  // not let it invent a probability for an otherwise explicitly entered PERT.
  if ((impact.value || capacity.value) && !fmea) {
    return { ok: false, error: 'Add all three FMEA ratings when entering an impact estimate, or leave the estimates blank.' };
  }
  return {
    ok: true,
    value: {
      ownerId: ownerId || null,
      goalId: goalId || null,
      stakeholderId: stakeholderId || null,
      responseAction: String(input.responseAction || '').replace(/\s+/g, ' ').trim().slice(0, 600),
      createDecision: input.createDecision === true,
      fmea,
      financial: impact.value ? { ...impact.value, currency } : null,
      capacity: capacity.value,
    },
    repairedReferences: Boolean(ownerError || goalError || stakeholderError),
  };
}
