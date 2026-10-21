// Bootstraps the operational rows every health check and runbook assumes
// exist: schema_version, maintenance_state, a handful of demo events so the
// projection/forecast machinery has real data to operate on.
import "dotenv/config";
import { db, pool } from "../src/db";
import { eventLog, maintenanceState, organizations, systemMeta } from "../src/db/schema";
import { CURRENT_SCHEMA_VERSION } from "../src/lib/ops/health/checks";
import { refreshProjection } from "../src/lib/ops/projection";

async function main() {
  await db
    .insert(systemMeta)
    .values({ key: "schema_version", value: { version: CURRENT_SCHEMA_VERSION }, updatedAt: new Date() })
    .onConflictDoUpdate({ target: systemMeta.key, set: { value: { version: CURRENT_SCHEMA_VERSION }, updatedAt: new Date() } });

  await db
    .insert(maintenanceState)
    .values({ id: "global", enabled: false })
    .onConflictDoNothing();

  const existingOrgs = await db.select().from(organizations).limit(1);
  if (existingOrgs.length === 0) {
    await db.insert(organizations).values([{ name: "Acme Leadership Group" }, { name: "Northwind Org" }]);
  }

  const existingEvents = await db.select().from(eventLog).limit(1);
  if (existingEvents.length === 0) {
    const now = Date.now();
    for (let day = 13; day >= 0; day--) {
      const count = 3 + Math.round(2 * Math.sin(day / 2)) + (day === 0 ? 1 : 0);
      for (let i = 0; i < Math.max(1, count); i++) {
        await db.insert(eventLog).values({
          eventType: "demo.seed_event",
          payload: { day, i },
          actor: "seed",
          createdAt: new Date(now - day * 86_400_000 - i * 60_000),
        });
      }
    }
  }

  await refreshProjection();
  console.log("Seed complete: schema_version, maintenance_state, demo organizations/events, projection refreshed.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
