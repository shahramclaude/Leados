// LEADOS — Part 38: syncs the declared registry (code) into the database
// (the "actual" side of config/schema drift detection) and seeds demo
// history so every check has real observations to evaluate on first run.

import { db } from "@/db";
import { assuranceChecks } from "@/db/schema";
import { CHECK_REGISTRY } from "@/lib/assurance/registry";
import { eq } from "drizzle-orm";
import { ensureSeedFlags } from "@/lib/featureFlags";
import { seedCalibrationHistory } from "@/lib/calibration";
import { seedFairnessHistory } from "@/lib/fairness";
import { seedRetrievalHistory } from "@/lib/retrieval";
import { seedCostQualityHistory } from "@/lib/aiQuality";
import { seedDataQualityHistory } from "@/lib/dataQuality";
import { seedLearningLoopHistory } from "@/lib/learningLoop";
import { ensureBaseline, getRecentSeries } from "@/lib/metrics";
import { runSecurityPosture } from "@/lib/security";
import { recordObservation } from "@/lib/metrics";
import { recordConfigDiffObservation } from "@/lib/configDrift";

export async function syncRegistryToDb() {
  for (const check of CHECK_REGISTRY) {
    const existing = await db.select().from(assuranceChecks).where(eq(assuranceChecks.id, check.id)).limit(1);
    const values = {
      id: check.id,
      domain: check.domain,
      name: check.name,
      method: check.method,
      cadence: check.cadence,
      thresholds: check.threshold,
      onBreach: check.onBreach,
      metricKeys: check.metricKeys,
      blindSpots: check.blindSpots,
      relatedPart: check.relatedPart,
      featureFlagKey: check.featureFlagKey ?? null,
      enabled: true,
    };
    if (existing.length === 0) {
      await db.insert(assuranceChecks).values(values);
    } else {
      await db.update(assuranceChecks).set({ ...values, updatedAt: new Date() }).where(eq(assuranceChecks.id, check.id));
    }
  }
}

async function seedSecurityHistoryIfMissing(days = 30) {
  await ensureBaseline("security.posture_score", "security", 1);
  const existing = await getRecentSeries("security.posture_score", 1);
  if (existing.length > 0) return;
  const posture = await runSecurityPosture();
  const now = Date.now();
  for (let day = 0; day < days; day++) {
    const observedAt = new Date(now - (days - day) * 86400000);
    await recordObservation({
      metricKey: "security.posture_score",
      domain: "security",
      value: day === days - 1 ? posture.score : 1,
      windowLabel: `daily-${observedAt.toISOString().slice(0, 10)}`,
      observedAt,
    });
  }
}

export async function ensureDemoHistorySeeded() {
  await ensureSeedFlags();

  const alreadySeeded = (await getRecentSeries("calibration.brier", 1)).length > 0;
  if (!alreadySeeded) {
    await seedCalibrationHistory(30);
    await seedFairnessHistory(30);
    await seedRetrievalHistory(12);
    await seedCostQualityHistory(30);
    await seedDataQualityHistory(30);
    await seedLearningLoopHistory(12);
  }
  await seedSecurityHistoryIfMissing();
}

export async function fullBootstrap() {
  await syncRegistryToDb();
  await ensureDemoHistorySeeded();
  // Config/schema drift reflects *current* live state, so it is recomputed
  // (not just seeded once) every time the system bootstraps/runs a cycle.
  await recordConfigDiffObservation();
}
