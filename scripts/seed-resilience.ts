// LEADOS — Part 35: seed failure domains, experiment catalog, risk register
// baseline, and continuity processes. Safe to re-run (upserts by unique key).
//
// Run with: npx tsx scripts/seed-resilience.ts

import "dotenv/config";
import { db } from "../src/db";
import { failureDomains, chaosExperiments, riskRegisterEntries } from "../src/db/schema";
import { FAILURE_DOMAINS, EXPERIMENTS } from "../src/lib/resilience";
import { seedContinuity } from "../src/lib/continuity";
import { eq } from "drizzle-orm";

async function main() {
  console.log("[seed] failure domains...");
  for (const d of FAILURE_DOMAINS) {
    const existing = await db.select().from(failureDomains).where(eq(failureDomains.key, d.key));
    if (existing.length === 0) {
      await db.insert(failureDomains).values({
        key: d.key,
        name: d.name,
        description: d.description,
        currentProtection: d.currentProtection,
        untestedAssumption: d.untestedAssumption,
        chaosTestable: d.chaosTestable,
      });
    } else {
      await db
        .update(failureDomains)
        .set({
          name: d.name,
          description: d.description,
          currentProtection: d.currentProtection,
          untestedAssumption: d.untestedAssumption,
          chaosTestable: d.chaosTestable,
        })
        .where(eq(failureDomains.key, d.key));
    }
  }

  console.log("[seed] chaos experiment catalog...");
  for (const e of EXPERIMENTS) {
    const existing = await db.select().from(chaosExperiments).where(eq(chaosExperiments.key, e.key));
    if (existing.length === 0) {
      await db.insert(chaosExperiments).values({
        key: e.key,
        title: e.title,
        domainKey: e.domainKey,
        hypothesis: e.hypothesis,
        injectionType: e.injectionType,
        blastRadius: e.blastRadius,
        steadyStateSlo: e.steadyStateSlo,
        rollbackPlan: e.rollbackPlan,
        safetyPolicy: e.safetyPolicy,
        schedule: e.schedule,
      });
    } else {
      await db
        .update(chaosExperiments)
        .set({
          title: e.title,
          domainKey: e.domainKey,
          hypothesis: e.hypothesis,
          injectionType: e.injectionType,
          blastRadius: e.blastRadius,
          steadyStateSlo: e.steadyStateSlo,
          rollbackPlan: e.rollbackPlan,
          safetyPolicy: e.safetyPolicy,
          schedule: e.schedule,
        })
        .where(eq(chaosExperiments.key, e.key));
    }
  }

  console.log("[seed] risk register baseline (all untested until an experiment runs)...");
  for (const e of EXPERIMENTS) {
    const existing = await db.select().from(riskRegisterEntries).where(eq(riskRegisterEntries.title, e.hypothesis));
    if (existing.length === 0) {
      await db.insert(riskRegisterEntries).values({
        domainKey: e.domainKey,
        title: e.hypothesis,
        description: `Baseline entry seeded from experiment catalog ${e.key}; untested until first chaos run.`,
        belief: "untested",
        owner: "resilience-lab",
        sourceExperimentKey: e.key,
      });
    }
  }

  console.log("[seed] continuity processes...");
  await seedContinuity();

  console.log("[seed] done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
