/**
 * scripts/seed.ts — deterministic seeder.
 *
 * Usage:
 *   npx tsx scripts/seed.ts            # scale x1  (baseline dev dataset)
 *   SCALE=10 npx tsx scripts/seed.ts   # scale x10 (perf-budget dataset)
 *
 * Deterministic: uses the same mulberry32 PRNG as the simulation engine
 * seeded from a fixed string, so re-running with the same SCALE always
 * produces the same row counts and the same risk-score/weight distribution.
 *
 * Multi-tenant on purpose: seeds the "Demo Org" tenant (the one the app
 * reads via resolveDemoTenantId) PLUS `NOISE_TENANTS` other tenants of the
 * same scale. This matters for the EXPLAIN ANALYZE evidence in
 * docs/PERFORMANCE.md — with only one tenant in the table, a `tenant_id`
 * index has zero selectivity (100% of rows match) and Postgres correctly
 * seq-scans past it; with N other tenants' rows in the same table, the
 * demo tenant's rows become a genuine minority and the planner switches to
 * an index scan, which is the realistic multi-tenant-SaaS shape this
 * schema is designed for (Part 03 tenancy).
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../src/db";
import { tenants, people, relationships, decisions, forecastRuns } from "../src/db/schema";
import { mulberry32 } from "../src/lib/mathUtils";

const SCALE = Number(process.env.SCALE ?? 1);
const NOISE_TENANTS = Number(process.env.NOISE_TENANTS ?? 4);
const BASE_PEOPLE = 150;
const BASE_RELATIONSHIPS = 400;
const BASE_DECISIONS = 5000;

const PEOPLE_COUNT = Math.round(BASE_PEOPLE * SCALE);
const RELATIONSHIP_COUNT = Math.round(BASE_RELATIONSHIPS * SCALE);
const DECISION_COUNT = Math.round(BASE_DECISIONS * SCALE);

const TEAMS = ["Platform", "Sales", "Finance", "People", "Product", "Ops"];
const ROLES = ["IC", "Senior IC", "Lead", "Manager", "Director"];
const REL_KINDS = ["reports_to", "collaborates_with", "mentors"];
const DECISION_KINDS = ["hiring", "promotion", "budget", "reorg", "performance_review"];

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function seedTenant(name: string, rand: () => number) {
  const [tenant] = await db.insert(tenants).values({ name }).returning({ id: tenants.id });
  const tenantId = tenant.id;

  const peopleIds: string[] = [];
  for (const batch of chunk(Array.from({ length: PEOPLE_COUNT }, (_, i) => i), 500)) {
    const rows = batch.map((i) => ({
      tenantId,
      name: `${name} Person ${i + 1}`,
      role: ROLES[Math.floor(rand() * ROLES.length)],
      team: TEAMS[Math.floor(rand() * TEAMS.length)],
      managerId: null as string | null,
      riskScore: rand(),
    }));
    const inserted = await db.insert(people).values(rows).returning({ id: people.id });
    peopleIds.push(...inserted.map((r) => r.id));
  }

  for (const batch of chunk(peopleIds, 500)) {
    await Promise.all(
      batch.map((id) => {
        if (rand() < 0.1) return Promise.resolve();
        const managerId = peopleIds[Math.floor(rand() * peopleIds.length)];
        if (managerId === id) return Promise.resolve();
        return db.execute(sql`update ${people} set manager_id = ${managerId} where id = ${id}`);
      }),
    );
  }

  for (const batch of chunk(Array.from({ length: RELATIONSHIP_COUNT }, (_, i) => i), 500)) {
    const rows = batch.map(() => ({
      tenantId,
      sourcePersonId: peopleIds[Math.floor(rand() * peopleIds.length)],
      targetPersonId: peopleIds[Math.floor(rand() * peopleIds.length)],
      kind: REL_KINDS[Math.floor(rand() * REL_KINDS.length)],
      weight: 0.2 + rand() * 2.8,
    }));
    await db.insert(relationships).values(rows);
  }

  const now = Date.now();
  for (const batch of chunk(Array.from({ length: DECISION_COUNT }, (_, i) => i), 1000)) {
    const rows = batch.map(() => {
      const daysAgo = Math.floor(rand() * 400);
      const occurredAt = new Date(now - daysAgo * 86_400_000 - Math.floor(rand() * 86_400_000));
      return {
        tenantId,
        personId: peopleIds[Math.floor(rand() * peopleIds.length)],
        kind: DECISION_KINDS[Math.floor(rand() * DECISION_KINDS.length)],
        impact: rand() * 2 - 1,
        occurredAt,
      };
    });
    await db.insert(decisions).values(rows);
  }

  return tenantId;
}

async function main() {
  const rand = mulberry32(0xc0ffee ^ SCALE);
  console.log(
    `Seeding LEADOS at scale x${SCALE}: 1 demo tenant + ${NOISE_TENANTS} noise tenants, ` +
      `each with people=${PEOPLE_COUNT}, relationships=${RELATIONSHIP_COUNT}, decisions=${DECISION_COUNT}`,
  );

  console.log("Clearing previous data...");
  await db.execute(sql`truncate table ${forecastRuns}, ${decisions}, ${relationships}, ${people}, ${tenants} cascade`);

  console.log("Seeding demo tenant (Demo Org)...");
  const demoTenantId = await seedTenant("Demo Org", rand);

  for (let i = 0; i < NOISE_TENANTS; i++) {
    console.log(`Seeding noise tenant ${i + 1}/${NOISE_TENANTS}...`);
    await seedTenant(`Noise Org ${i + 1}`, rand);
  }

  const totals = await db.execute(sql`select
      (select count(*) from ${tenants}) as tenants,
      (select count(*) from ${people}) as people,
      (select count(*) from ${relationships}) as relationships,
      (select count(*) from ${decisions}) as decisions`);

  console.log("Done.");
  console.log(`demoTenantId=${demoTenantId}`);
  console.log("Totals across all tenants:", totals.rows[0]);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
