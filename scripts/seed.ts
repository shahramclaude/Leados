// Seeds the "demo" tenant used throughout docs/tutorials/first-hour.md.
//
// Idempotent: running it twice updates/reuses the existing demo tenant rather
// than creating duplicates, so it is safe to re-run after `drizzle-kit push`.
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { leads, reps, rules, tenants } from "../src/db/schema";

async function main() {
  const [tenant] =
    (await db.select().from(tenants).where(eq(tenants.slug, "demo")).limit(1)).length > 0
      ? await db.select().from(tenants).where(eq(tenants.slug, "demo")).limit(1)
      : await db.insert(tenants).values({ slug: "demo", name: "Demo Co" }).returning();

  console.log(`Tenant ready: ${tenant.slug} (id=${tenant.id})`);

  const existingReps = await db.select().from(reps).where(eq(reps.tenantId, tenant.id));
  if (existingReps.length === 0) {
    await db.insert(reps).values([
      { tenantId: tenant.id, name: "Avery Chen", email: "avery@demo.co" },
      { tenantId: tenant.id, name: "Jordan Patel", email: "jordan@demo.co" },
    ]);
    console.log("Seeded 2 reps.");
  } else {
    console.log(`Reps already present (${existingReps.length}).`);
  }

  const existingRules = await db.select().from(rules).where(eq(rules.tenantId, tenant.id));
  if (existingRules.length === 0) {
    await db.insert(rules).values([
      {
        tenantId: tenant.id,
        name: "Large company",
        field: "employeeCount",
        operator: "gte",
        value: "200",
        weight: 35,
      },
      {
        tenantId: tenant.id,
        name: "Budget confirmed",
        field: "budgetConfirmed",
        operator: "truthy",
        value: "true",
        weight: 30,
      },
      {
        tenantId: tenant.id,
        name: "High engagement",
        field: "engagementScore",
        operator: "gte",
        value: "7",
        weight: 25,
      },
      {
        tenantId: tenant.id,
        name: "Inbound source",
        field: "source",
        operator: "eq",
        value: "inbound",
        weight: 10,
      },
    ]);
    console.log("Seeded 4 scoring rules.");
  } else {
    console.log(`Rules already present (${existingRules.length}).`);
  }

  const existingLeads = await db.select().from(leads).where(eq(leads.tenantId, tenant.id));
  if (existingLeads.length === 0) {
    await db.insert(leads).values([
      {
        tenantId: tenant.id,
        name: "Priya Shah",
        company: "Northwind Robotics",
        email: "priya@northwind.example",
        source: "inbound",
        signals: { employeeCount: 450, budgetConfirmed: true, engagementScore: 8 },
      },
      {
        tenantId: tenant.id,
        name: "Marco Rossi",
        company: "Rossi Freight",
        email: "marco@rossifreight.example",
        source: "outbound",
        signals: { employeeCount: 40, budgetConfirmed: false, engagementScore: 3 },
      },
      {
        tenantId: tenant.id,
        name: "Lena Fischer",
        company: "Fischer Analytics",
        email: "lena@fischeranalytics.example",
        source: "inbound",
        signals: { employeeCount: 220, budgetConfirmed: true, engagementScore: 5 },
      },
    ]);
    console.log("Seeded 3 leads (unscored — score them via POST /api/leads/:id/score).");
  } else {
    console.log(`Leads already present (${existingLeads.length}).`);
  }

  console.log("Seed complete. Next: npm run dev, then open http://localhost:3000");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
