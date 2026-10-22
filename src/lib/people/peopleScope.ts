// src/lib/people/peopleScope.ts
//
// Repository-layer privacy scoping. `PeopleScope = { viewerRole, subjectId, purpose }`
// is enforced here, in one place, so every API route and server component
// goes through the same gate instead of re-implementing access logic.
//
// Rules (deliberately conservative — see AI-SESSION-LOG.md Phase 5 for the
// trade-offs this creates):
//   - self:    sees everything about themselves, all resource types, always.
//   - manager: for their DIRECT reports only, sees growth-relevant detail
//              (skills, growth plan, succession gaps, workload) but NOT
//              individual compensation figures or any other report's
//              individual comp — only compensation-band aggregates.
//   - hr:      broader operational access for the resource types HR
//              legitimately administers (compensation, corrections
//              resolution), still never an individual ranking list.
//   - org:     aggregates only, and only when the underlying group size is
//              >= k (default 5) — enforced again at this layer even though
//              `compensation.ts`/`report.ts` also check it, as defense in
//              depth.
//
// There is deliberately NO resource type for "individual ranking" — see
// `assertNoStackRanking`. If a caller wants a sorted list of people, the
// only thing this module will hand back is the same per-person, per-skill
// gap view the subject themselves can see (view parity), never a bare
// ordering with hidden inputs.

export type PeopleResourceType =
  | "skills-evidence"
  | "growth-plan"
  | "succession-gaps"
  | "workload-individual"
  | "workload-team-aggregate"
  | "compensation-individual"
  | "compensation-band-aggregate"
  | "team-composer";

export interface PeopleScope {
  viewerId: string;
  viewerRole: "self" | "manager" | "hr" | "org";
  subjectId?: string;
  purpose: string;
}

export interface ScopeDirectory {
  isManagerOf(viewerId: string, subjectId: string): boolean;
}

export class PeopleScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeopleScopeError";
  }
}

export type AccessLevel = "full" | "growth-relevant" | "aggregate-only" | "denied";

const MANAGER_ALLOWED: PeopleResourceType[] = ["skills-evidence", "growth-plan", "succession-gaps", "workload-individual", "workload-team-aggregate", "team-composer", "compensation-band-aggregate"];
const HR_ALLOWED: PeopleResourceType[] = ["skills-evidence", "growth-plan", "succession-gaps", "workload-individual", "workload-team-aggregate", "team-composer", "compensation-individual", "compensation-band-aggregate"];
const ORG_ALLOWED: PeopleResourceType[] = ["workload-team-aggregate", "compensation-band-aggregate"];

/**
 * Returns the access level a scope has for a resource about `subjectId`
 * (pass the viewer's own id as subjectId for self-resources). Throws
 * `PeopleScopeError` when access is denied outright, so callers can `try {}`
 * once at the repository boundary rather than threading booleans everywhere.
 */
export function checkAccess(scope: PeopleScope, resourceType: PeopleResourceType, subjectId: string, directory: ScopeDirectory): AccessLevel {
  if (scope.viewerId === subjectId) return "full";

  if (scope.viewerRole === "manager") {
    if (!directory.isManagerOf(scope.viewerId, subjectId)) {
      throw new PeopleScopeError(`manager ${scope.viewerId} is not the manager of ${subjectId}; denied ${resourceType}`);
    }
    if (!MANAGER_ALLOWED.includes(resourceType)) {
      throw new PeopleScopeError(`resource ${resourceType} is not visible to managers (individual compensation and rankings are never manager-visible); denied`);
    }
    return resourceType === "compensation-band-aggregate" || resourceType === "workload-team-aggregate" ? "aggregate-only" : "growth-relevant";
  }

  if (scope.viewerRole === "hr") {
    if (!HR_ALLOWED.includes(resourceType)) {
      throw new PeopleScopeError(`resource ${resourceType} is not visible to hr role; denied`);
    }
    return resourceType.endsWith("aggregate") ? "aggregate-only" : "growth-relevant";
  }

  if (scope.viewerRole === "org") {
    if (!ORG_ALLOWED.includes(resourceType)) {
      throw new PeopleScopeError(`resource ${resourceType} requires individual-level access and is not visible at org scope; denied`);
    }
    return "aggregate-only";
  }

  throw new PeopleScopeError(`viewer ${scope.viewerId} with role ${scope.viewerRole} has no path to view ${resourceType} for ${subjectId}`);
}

/**
 * Asserts that a would-be "ranking" payload has view parity with what the
 * subject themselves would see: every entry must expose the same named-gap
 * detail a self-view would, and the payload must not be a bare sorted score
 * list. This is a structural check used by API routes before they return
 * anything shaped like a leaderboard.
 */
export function assertNoOpaqueRanking<T extends { gaps?: unknown; fitScore?: unknown }>(items: T[]): void {
  for (const item of items) {
    if (item.fitScore !== undefined && item.gaps === undefined) {
      throw new PeopleScopeError("refusing to return a score without the paired named-gap detail the subject can see — this would be an opaque ranking");
    }
  }
}

export function inMemoryDirectory(employees: { id: string; managerId: string | null }[]): ScopeDirectory {
  const byId = new Map(employees.map((e) => [e.id, e]));
  return {
    isManagerOf(viewerId, subjectId) {
      return byId.get(subjectId)?.managerId === viewerId;
    },
  };
}
