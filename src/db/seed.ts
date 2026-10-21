// Idempotent demo seed: two orgs, a handful of users/roles, API keys, and a
// few findings so every page has something to show immediately. Run with
// `npx tsx src/db/seed.ts`.
import "dotenv/config";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "@/db";
import {
  orgs,
  users,
  memberships,
  rolePermissions,
  apiKeys,
  findings,
  budgets,
} from "@/db/schema";
import { ROLE_PERMISSIONS, type Role } from "@/lib/permissions";
import { currentPeriod } from "@/lib/budget";

async function upsertOrg(name: string, slug: string) {
  const [existing] = await db.select().from(orgs).where(eq(orgs.slug, slug));
  if (existing) return existing;
  const [created] = await db.insert(orgs).values({ name, slug }).returning();
  return created;
}

async function upsertUser(email: string, name: string) {
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) return existing;
  const [created] = await db.insert(users).values({ email, name }).returning();
  return created;
}

async function upsertMembership(orgId: string, userId: string, role: Role) {
  const [existing] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.orgId, orgId));
  const found = existing && existing.userId === userId ? existing : null;
  if (found) return found;
  const [created] = await db.insert(memberships).values({ orgId, userId, role }).returning();
  return created;
}

async function main() {
  console.log("Seeding LEADOS demo data...");

  await db.delete(rolePermissions);
  for (const role of Object.keys(ROLE_PERMISSIONS) as Role[]) {
    for (const permission of ROLE_PERMISSIONS[role]) {
      await db.insert(rolePermissions).values({ role, permission }).onConflictDoNothing();
    }
  }

  const acme = await upsertOrg("Acme Robotics", "acme");
  const globex = await upsertOrg("Globex Holdings", "globex");

  const alice = await upsertUser("alice@acme.test", "Alice Owner");
  const bob = await upsertUser("bob@acme.test", "Bob Analyst");
  const carol = await upsertUser("carol@acme.test", "Carol Viewer");
  const dave = await upsertUser("dave@globex.test", "Dave Admin");

  await upsertMembership(acme.id, alice.id, "owner");
  await upsertMembership(acme.id, bob.id, "analyst");
  await upsertMembership(acme.id, carol.id, "viewer");
  await upsertMembership(globex.id, dave.id, "admin");

  const apiKeyTargets: Array<{ org: typeof acme; scopes: string[] }> = [
    { org: acme, scopes: ["finding:read"] },
    { org: globex, scopes: ["finding:read"] },
  ];
  for (const { org, scopes } of apiKeyTargets) {
    const rawKey = `leados_${org.slug}_demo_key`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const [existing] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash));
    if (!existing) {
      await db.insert(apiKeys).values({
        orgId: org.id,
        name: `${org.name} public API key`,
        keyHash,
        scopes,
      });
    }
    console.log(`Public API key for ${org.name}: ${rawKey}`);
  }

  const existingFindings = await db.select().from(findings).where(eq(findings.orgId, acme.id));
  if (existingFindings.length === 0) {
    await db.insert(findings).values([
      {
        orgId: acme.id,
        domain: "intelligence",
        title: "Competitor launch signal in EU market",
        summary: "Three independent sources point to a Q3 competitor launch in the EU.",
        causalConfidence: "correlational",
        source: "human",
        createdBy: alice.id,
        explanation: {
          headline: "Likely competitor EU launch in Q3",
          reasons: [
            "Patent filing spike in relevant category (EU office, last 60 days).",
            "Hiring surge in EU go-to-market roles at the competitor.",
            "Trade press mentions trending up 3x month-over-month.",
          ],
          evidence: [
            { label: "Patent feed", ref: "feed:patents:eu:2026-q1" },
            { label: "Job postings scrape", ref: "scrape:jobs:2026-02" },
          ],
          confidence: 0.62,
          detail: { signalCount: 7, timeWindowDays: 60 },
        },
      },
      {
        orgId: acme.id,
        domain: "people",
        title: "Elevated attrition risk in Platform team",
        summary: "Platform team attrition is 2.1x the org baseline over 90 days.",
        causalConfidence: "correlational",
        source: "human",
        createdBy: bob.id,
        explanation: {
          headline: "Platform team attrition trending high",
          reasons: [
            "4 voluntary departures in 90 days vs. 1.9 expected.",
            "Engagement survey scores down 11 points quarter-over-quarter.",
          ],
          evidence: [{ label: "HRIS export", ref: "hris:team-14:q1-2026" }],
          confidence: 0.71,
          detail: { roleTitle: "Platform Engineer", teamSize: 12 },
        },
      },
      {
        orgId: acme.id,
        domain: "finance",
        title: "Gross margin drifted outside control band",
        summary: "Gross margin moved outside the 90-day control band in January close.",
        causalConfidence: "experimental",
        source: "human",
        createdBy: alice.id,
        explanation: {
          headline: "January margin compression confirmed by A/B pricing test",
          reasons: [
            "Controlled pricing experiment (50/50 split) shows a 1.8pt margin gap.",
            "Effect replicated in both US and EU cohorts.",
          ],
          evidence: [{ label: "Pricing experiment #12", ref: "exp:pricing:12" }],
          confidence: 0.83,
          detail: { metric: "gross_margin_pct", deltaPct: -1.8 },
        },
      },
    ]);
  }

  await db
    .insert(budgets)
    .values({ orgId: acme.id, period: currentPeriod(), computeUnitsLimit: 100, computeUnitsUsed: 0 })
    .onConflictDoNothing();
  await db
    .insert(budgets)
    .values({ orgId: globex.id, period: currentPeriod(), computeUnitsLimit: 20, computeUnitsUsed: 0 })
    .onConflictDoNothing();

  console.log("Seed complete.");
  console.log(`Acme org id: ${acme.id}`);
  console.log(`Globex org id: ${globex.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
