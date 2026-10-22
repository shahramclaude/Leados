// LEADOS — Part 35 resilience lab.
//
// This module exists purely to carry the before/after of the ONE experiment
// in this chaos suite that genuinely broke on first run: exp-clock-skew.
//
// `getLatestProbeNaive` is the ORIGINAL implementation this codebase shipped
// with: "latest" means "max(recordedAt)". A clock-skewed write (operator
// error, bad NTP, a misconfigured batch job backdating/forward-dating rows)
// poisons every later read until an even-more-skewed row arrives — a classic
// "trusted client clock" bug.
//
// `getLatestProbeHardened` is the fix produced by the chaos run: "latest"
// means "max(id)", i.e. database-assigned monotonic sequence, with
// `recordedAt` kept only as descriptive metadata, never as the ordering key.
// This is the hardening task created by resilience_hardening_tasks after the
// first (failing) run of exp-clock-skew. See RESILIENCE.md Phase 5 Q3.

import { db } from "@/db";
import { clockSkewProbes } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function getLatestProbeNaive() {
  const rows = await db
    .select()
    .from(clockSkewProbes)
    .orderBy(desc(clockSkewProbes.recordedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLatestProbeHardened() {
  const rows = await db
    .select()
    .from(clockSkewProbes)
    .orderBy(desc(clockSkewProbes.id))
    .limit(1);
  return rows[0] ?? null;
}
