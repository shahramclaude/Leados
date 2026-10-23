// src/lib/privacy.ts
//
// RECONSTRUCTION NOTE: see src/lib/circadian.ts header. This stands in for
// Part 09's privacy rules, exposing the two primitives Part 52 depends on:
// (1) the k-anonymity threshold used for opt-in research aggregation, and
// (2) a small, explicit Grant model (self-issued, scoped, expiring consent)
// that other parts (like the Part 45 scheduling optimizer) must hold before
// they may read any derived signal from a person's private data.
//
// Nothing in this file grants read access by itself — grants are checked
// against the actor + owner identity in the repository layer
// (src/lib/leaderState/repository.ts), which is the actual enforcement
// point per the standing order ("access enforcement at the repository
// layer").

/** Minimum cohort size before any aggregated research figure may be shown. */
export const K_ANONYMITY_THRESHOLD = 5;

export type GrantScope = "scheduler-optimizer" | "research-aggregate";

export interface GrantRecord {
  id: string;
  ownerUserId: string;
  scope: GrantScope;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** A grant is active only if unrevoked and strictly before its expiry instant. */
export function isGrantActive(grant: Pick<GrantRecord, "revokedAt" | "expiresAt">, now: Date = new Date()): boolean {
  if (grant.revokedAt) return false;
  return now.getTime() < grant.expiresAt.getTime();
}

/**
 * Roles that exist elsewhere in Leados. The role alone never grants access —
 * only `actor.userId === ownerUserId` does (checked in the repository
 * layer). Role is kept here purely for audit/log readability and for the
 * self-scope attempt matrix tests.
 */
export type ActorRole = "member" | "admin" | "manager" | "system";

export interface ActorContext {
  userId: string;
  role: ActorRole;
}

/**
 * Suppresses any aggregate whose contributing-member count is below the
 * k-anonymity threshold. This is the single gate research reads must pass
 * through — see src/lib/leaderState/research.ts.
 */
export function applyKAnonymity<T>(cohortSize: number, value: T): { suppressed: true } | { suppressed: false; value: T } {
  if (cohortSize < K_ANONYMITY_THRESHOLD) {
    return { suppressed: true };
  }
  return { suppressed: false, value };
}
