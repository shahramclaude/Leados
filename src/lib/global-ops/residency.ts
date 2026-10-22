// LEADOS — Part 37: data residency policy model, enforced at the repository layer.
//
// Policy shape: data class x allowed regions. A "region" here is the same coarse bucket used on
// `entities.region` (e.g. "eu", "us", "apac") — not a specific datacenter — documented scope
// limitation (see PHASE 5 #3/#4). Enforcement happens in `src/lib/global-ops/repository.ts`,
// which every page/route in this part goes through; there is no code path in this part that
// reads entity-scoped data directly from `db` without passing through the guard.

export interface ResidencyPolicy {
  dataClass: string;
  description: string;
  allowedRegions: string[];
}

export class ResidencyViolationError extends Error {
  constructor(
    public readonly dataClass: string,
    public readonly requestingRegion: string,
    public readonly allowedRegions: string[],
  ) {
    super(
      `Residency violation: data class "${dataClass}" may not be read from region "${requestingRegion}". ` +
        `Allowed regions: ${allowedRegions.length ? allowedRegions.join(", ") : "(none configured — fail closed)"}.`,
    );
    this.name = "ResidencyViolationError";
  }
}

export function isRegionAllowed(policy: ResidencyPolicy, requestingRegion: string): boolean {
  return policy.allowedRegions.includes(requestingRegion);
}

/** Throws if the requesting region may not read this data class. Fails closed: an unknown
 * policy or an empty allow-list blocks the read rather than defaulting to "allow". */
export function assertResidencyAllowed(policy: ResidencyPolicy | undefined, dataClass: string, requestingRegion: string): void {
  if (!policy) {
    throw new ResidencyViolationError(dataClass, requestingRegion, []);
  }
  if (!isRegionAllowed(policy, requestingRegion)) {
    throw new ResidencyViolationError(dataClass, requestingRegion, policy.allowedRegions);
  }
}

export interface ResidencyFilterResult<T> {
  allowed: T[];
  blocked: { row: T; dataClass: string; reason: string }[];
}

/** Filters a list of rows, each tagged with a data class, against policy for a requesting
 * region. Disallowed rows are never silently dropped — they are returned in `blocked` so the UI
 * can surface "N records withheld by data residency policy" rather than presenting an
 * artificially clean (and misleading) list. */
export function filterByResidency<T>(
  rows: T[],
  getDataClass: (row: T) => string,
  policiesByClass: Map<string, ResidencyPolicy>,
  requestingRegion: string,
): ResidencyFilterResult<T> {
  const allowed: T[] = [];
  const blocked: { row: T; dataClass: string; reason: string }[] = [];
  for (const row of rows) {
    const dataClass = getDataClass(row);
    const policy = policiesByClass.get(dataClass);
    if (policy && isRegionAllowed(policy, requestingRegion)) {
      allowed.push(row);
    } else {
      blocked.push({
        row,
        dataClass,
        reason: policy
          ? `region "${requestingRegion}" not in allowed list [${policy.allowedRegions.join(", ")}]`
          : `no residency policy configured for data class "${dataClass}" — fail closed`,
      });
    }
  }
  return { allowed, blocked };
}
