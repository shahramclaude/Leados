// Shared server-side data access for seam 2 (assurance monitors every
// engine). Extracted so /api/assurance and the dashboard compute the exact
// same "latest check per engine" view instead of two drifting implementations
// (see docs/RED-TEAM-FINAL.md #35 — this is the de-duplication fix).
import { db } from "@/db";
import { assuranceChecks, engines } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { summarizeAssurance, type EngineResult, type EngineSeverity } from "./assurance";

export async function getAssuranceSnapshot() {
  const allEngines = await db.select().from(engines);

  const latestCheckByEngine = await Promise.all(
    allEngines.map(async (engine) => {
      const [latest] = await db
        .select()
        .from(assuranceChecks)
        .where(eq(assuranceChecks.engineId, engine.id))
        .orderBy(desc(assuranceChecks.checkedAt))
        .limit(1);
      return { engine, latest: latest ?? null };
    }),
  );

  const summary = summarizeAssurance(
    allEngines.map((e) => e.key),
    latestCheckByEngine
      .filter((e) => e.latest)
      .map((e) => ({
        engineKey: e.engine.key,
        result: e.latest!.result as EngineResult,
        severity: e.latest!.severity as EngineSeverity,
        checkedAt: e.latest!.checkedAt,
      })),
  );

  return { engines: allEngines, latestCheckByEngine, summary };
}
