// LEADOS Part 31 — privacy guardrails for per-person structural metrics.
//
// HONESTY RULE (standing order): network metrics describe structure, never
// individual worth or influence over people. On top of that framing rule, this
// module enforces a hard *access* control: an individual's own centrality
// numbers are only readable by (a) themselves, (b) their direct manager,
// (c) an explicitly granted hr_admin/exec scope. Everyone else gets a coarse,
// banded signal ("low/medium/high") with no exact number — enough to support
// aggregate dependency-risk work without enabling ranking or surveillance of
// named individuals.

import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { people, personMetricGrants } from "@/db/schema";

export type Scope = "self" | "manager" | "hr_admin" | "exec";

export interface AccessDecision {
  allowed: boolean;
  scope?: Scope;
  reason: string;
}

/**
 * `requesterId` and `personId` are both roster ids (eco_people.id), matching the
 * simplification documented in schema.ts that a person's roster id doubles as
 * their login id in this stand-in roster.
 */
export async function canViewPersonCentrality(
  requesterId: string,
  personId: string,
): Promise<AccessDecision> {
  if (!requesterId) {
    return { allowed: false, reason: "no requester identity supplied" };
  }

  if (requesterId === personId) {
    return { allowed: true, scope: "self", reason: "requester is the subject" };
  }

  const [subject] = await db.select().from(people).where(eq(people.id, personId)).limit(1);
  if (subject?.managerId === requesterId) {
    return { allowed: true, scope: "manager", reason: "requester is the subject's manager" };
  }

  const [grant] = await db
    .select()
    .from(personMetricGrants)
    .where(
      and(
        eq(personMetricGrants.personId, personId),
        eq(personMetricGrants.granteeUserId, requesterId),
      ),
    )
    .limit(1);

  if (grant && (grant.scope === "hr_admin" || grant.scope === "exec")) {
    return { allowed: true, scope: grant.scope, reason: `explicit ${grant.scope} grant` };
  }

  return { allowed: false, reason: "no self/manager/hr_admin/exec scope found" };
}

export function bandValue(value: number, thresholds: { low: number; high: number }): "low" | "medium" | "high" {
  if (value < thresholds.low) return "low";
  if (value < thresholds.high) return "medium";
  return "high";
}

/** Redacts a precise numeric metric into a coarse band for unauthorized viewers. */
export function maskCentrality(
  value: number,
  allowed: boolean,
): { value: number | null; band: "low" | "medium" | "high" } {
  const band = bandValue(value, { low: 0.1, high: 0.4 });
  return { value: allowed ? value : null, band };
}
