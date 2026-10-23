// Rumor control: the double-source rule.
//
// A claim is only "confirmed" when it has at least two INDEPENDENT sources
// (independence = distinct source identity AND not both merely repeating the
// same upstream outlet type when that type is explicitly "rumor"/"social").
// Single-source items — including anything sourced only from "rumor" or
// "social" channels — are always quarantined as "unconfirmed" and must be
// visibly labelled as such anywhere they are displayed or referenced in
// outbound comms.

export interface ClaimSource {
  name: string;
  type: string; // e.g. "official", "press", "internal", "social", "rumor"
  reportedAt: string;
}

export type ClaimStatus = "unconfirmed" | "confirmed" | "debunked";

const UNRELIABLE_SOLO_TYPES = new Set(["rumor", "social", "anonymous"]);

export interface ClaimEvaluation {
  status: ClaimStatus;
  independentSourceCount: number;
  reason: string;
}

/**
 * Evaluates a claim's sources and returns the status the double-source rule
 * requires. This is pure and DB-free so it can be unit tested directly with
 * seeded single-source "rumor" fixtures.
 */
export function evaluateClaim(sources: ClaimSource[]): ClaimEvaluation {
  if (sources.length === 0) {
    return { status: "unconfirmed", independentSourceCount: 0, reason: "No sources supplied." };
  }

  // Independence: dedupe by normalized name — two citations of the same
  // named source do not count twice.
  const byName = new Map<string, ClaimSource>();
  for (const s of sources) {
    const key = s.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, s);
  }
  const independent = [...byName.values()];
  const independentSourceCount = independent.length;

  if (independentSourceCount === 1) {
    const solo = independent[0];
    const label = UNRELIABLE_SOLO_TYPES.has(solo.type.toLowerCase())
      ? `single source of type "${solo.type}"`
      : "single source";
    return {
      status: "unconfirmed",
      independentSourceCount,
      reason: `Quarantined: only ${label} ("${solo.name}"). The double-source rule requires >=2 independent sources before a claim may surface as fact in crisis mode.`,
    };
  }

  // Two or more independent sources: confirmed UNLESS all of them are of an
  // inherently unreliable solo type (e.g. two anonymous social posts don't
  // make a rumor a fact) — in which case it is still quarantined.
  const allUnreliable = independent.every((s) => UNRELIABLE_SOLO_TYPES.has(s.type.toLowerCase()));
  if (allUnreliable) {
    return {
      status: "unconfirmed",
      independentSourceCount,
      reason: `Quarantined: ${independentSourceCount} sources, but all are of unreliable solo types (${[...new Set(independent.map((s) => s.type))].join(", ")}). Needs at least one verifiable/official source.`,
    };
  }

  return {
    status: "confirmed",
    independentSourceCount,
    reason: `Confirmed: ${independentSourceCount} independent sources corroborate this claim.`,
  };
}

/** Helper used by comms composition to block single-sourced facts from outbound messages. */
export function assertSafeToStateAsFact(sources: ClaimSource[]): { ok: boolean; reason: string } {
  const evalResult = evaluateClaim(sources);
  if (evalResult.status !== "confirmed") {
    return {
      ok: false,
      reason: `Cannot state as fact: claim status is "${evalResult.status}" (${evalResult.reason})`,
    };
  }
  return { ok: true, reason: "Double-sourced and confirmed." };
}
