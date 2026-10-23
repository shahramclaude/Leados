import "server-only";
import { db } from "@/db";
import { coverageParts, verificationLogs } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { coverageSeedData } from "./coverageSeedData";
import type { SeedStatus, VerifiedStatus } from "./coverageTypes";

export type {
  VerifiedStatus,
  SeedStatus,
} from "./coverageTypes";
export {
  VERIFIED_STATUS_LABELS,
  SEED_STATUS_LABELS,
  SEED_STATUS_BADGE,
  VERIFIED_STATUS_BADGE,
} from "./coverageTypes";

export type CoveragePartRow = typeof coverageParts.$inferSelect;
export type VerificationLogRow = typeof verificationLogs.$inferSelect;

let seedInFlight: Promise<void> | null = null;

/**
 * Idempotently seeds the coverage_parts table from the Part 59 dry-run
 * document the first time the app touches the table. Safe to call on every
 * request — it is a no-op once rows exist.
 */
export async function ensureCoverageSeeded(): Promise<void> {
  if (!seedInFlight) {
    seedInFlight = (async () => {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(coverageParts);

      if (count > 0) return;

      await db
        .insert(coverageParts)
        .values(
          coverageSeedData.map((row) => ({
            partNumber: row.partNumber,
            title: row.title,
            seedStatus: row.seedStatus,
            evidence: row.evidence,
            note: row.note || null,
            currentStatus: "unverified" as const,
          })),
        )
        .onConflictDoNothing({ target: coverageParts.partNumber });
    })();
  }
  await seedInFlight;
}

export async function getAllParts() {
  await ensureCoverageSeeded();
  return db.select().from(coverageParts).orderBy(coverageParts.partNumber);
}

export async function getPartByNumber(partNumber: number) {
  await ensureCoverageSeeded();
  const rows = await db
    .select()
    .from(coverageParts)
    .where(eq(coverageParts.partNumber, partNumber))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLogsForPart(partId: number) {
  return db
    .select()
    .from(verificationLogs)
    .where(eq(verificationLogs.partId, partId))
    .orderBy(verificationLogs.verifiedAt);
}

export async function getSummary() {
  const parts = await getAllParts();
  const seedCounts = { canonical: 0, partial: 0, absent: 0 };
  const verifiedCounts = {
    unverified: 0,
    present: 0,
    partial: 0,
    missing: 0,
    legacy_quarantined: 0,
  };
  for (const part of parts) {
    seedCounts[part.seedStatus as SeedStatus] += 1;
    verifiedCounts[part.currentStatus as VerifiedStatus] += 1;
  }
  return {
    total: parts.length,
    seedCounts,
    verifiedCounts,
    gapsRemaining: parts.filter(
      (p) => p.currentStatus === "unverified" && p.seedStatus !== "canonical",
    ).length,
  };
}
