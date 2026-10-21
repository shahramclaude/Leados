// Part 09-G: repository-layer access control. Every people-data read in this
// codebase goes through `requireActor` + a `can*` check BEFORE data leaves
// the repository function — never a UI-only gate. This is the file the
// two-user privacy tests (scripts/test-privacy.ts) exercise directly.
//
// Declared policy (see docs/FAIRNESS.md "Privacy policy"):
//  - Self:      can see own aggregate, own shared 1:1 notes/agenda, own
//               growth plans, own transparency report. CANNOT see manager's
//               private prep notes about them, and cannot see HR-only
//               personnel flags.
//  - Manager:   can see their direct reports' work-relevant aggregate
//               (role, skills, goals, shared 1:1s, growth plans, flight-risk
//               Explain) and their OWN private prep notes. CANNOT see
//               HR-only personnel fields (e.g. HR case notes) and cannot see
//               another manager's reports.
//  - HR:        can see all people's aggregates, all private 1:1 notes
//               (for compliance/duty-of-care), HR-only fields, and can
//               trigger transparency/erasure flows. HR access over broad
//               scopes is logged (see auditedRead below) specifically
//               because of its power — this is a constraint on misuse, not
//               a technical gate, and is documented in the self-review.
//  - Executive: can see aggregated/team-level analytics (team health,
//               succession bench) but NOT individual private notes or
//               individual flight-risk scores — exec access is capped at
//               team-level to reduce the chance of a score being used to
//               single out an individual outside HR process.
export type GlobalRole = "employee" | "manager" | "hr" | "executive";

export interface Actor {
  id: string;
  globalRole: GlobalRole;
}

export class AccessDeniedError extends Error {
  constructor(reason: string) {
    super(`Access denied: ${reason}`);
    this.name = "AccessDeniedError";
  }
}

export function isSelf(actor: Actor, personId: string): boolean {
  return actor.id === personId;
}

export function isManagerOf(actor: Actor, personManagerId: string | null | undefined): boolean {
  return actor.globalRole === "manager" && !!personManagerId && actor.id === personManagerId;
}

export function isHr(actor: Actor): boolean {
  return actor.globalRole === "hr";
}

export function isExecutive(actor: Actor): boolean {
  return actor.globalRole === "executive";
}

/** Can read the person's work-relevant aggregate (role/skills/goals/flight-risk). */
export function canReadPersonAggregate(
  actor: Actor,
  person: { id: string; managerId: string | null },
): boolean {
  if (isSelf(actor, person.id)) return true;
  if (isManagerOf(actor, person.managerId)) return true;
  if (isHr(actor)) return true;
  return false; // executives: team-level only, not individual aggregate
}

/** Can read a specific 1:1's shared notes/agenda (both participants + HR). */
export function canReadOneOnOneShared(
  actor: Actor,
  oneOnOne: { managerId: string; employeeId: string },
): boolean {
  return (
    actor.id === oneOnOne.managerId ||
    actor.id === oneOnOne.employeeId ||
    isHr(actor)
  );
}

/**
 * Can read the manager's PRIVATE prep notes for a 1:1. Per the declared
 * policy, the employee counterpart is explicitly excluded, even though they
 * can read everything else about their own 1:1. HR can read for compliance.
 */
export function canReadOneOnOnePrivateNotes(
  actor: Actor,
  oneOnOne: { managerId: string },
): boolean {
  return actor.id === oneOnOne.managerId || isHr(actor);
}

/** Can read HR-only personnel fields (e.g. case notes, disciplinary flags). */
export function canReadHrOnlyFields(actor: Actor): boolean {
  return isHr(actor);
}

/** Can read an individual's flight-risk / succession-readiness Explain<T>. */
export function canReadIndividualScore(
  actor: Actor,
  person: { id: string; managerId: string | null },
): boolean {
  if (isSelf(actor, person.id)) return true; // transparency: you can see your own score
  if (isManagerOf(actor, person.managerId)) return true;
  if (isHr(actor)) return true;
  return false; // executives see team roll-ups only — see teamHealth.ts/succession.ts
}

/** Can read team-level aggregates (team health, bench strength, succession matrix). */
export function canReadTeamAggregate(actor: Actor): boolean {
  return actor.globalRole === "manager" || isHr(actor) || isExecutive(actor);
}

/**
 * Can read the GDPR-Art.15-style transparency report for a person. Scoped to
 * self + HR only: a manager or executive must not be able to use the
 * transparency view as a side-channel for surveillance of an employee who
 * is not technically "their" individual-score read (defense in depth).
 */
export function canReadTransparencyReport(actor: Actor, personId: string): boolean {
  return isSelf(actor, personId) || isHr(actor);
}

/** Can request erasure on behalf of a person (HR only; self can request, HR executes). */
export function canRequestErasure(actor: Actor, personId: string): boolean {
  return isSelf(actor, personId) || isHr(actor);
}

export function assertAccess(ok: boolean, reason: string): void {
  if (!ok) throw new AccessDeniedError(reason);
}
