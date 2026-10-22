import "server-only";
import { db } from "@/db";
import { engineRecords, memberships, orgs, users, type DomainScope, type MembershipRole } from "@/db/schema";
import { eq } from "drizzle-orm";

// Dev-only demo data bootstrap. Stands in for Part 01's seeded-worlds
// onboarding fixtures (not present in this sandbox checkout). Produces two
// fully isolated tenants in two different locales so tenancy + i18n can be
// demonstrated and tested end-to-end without a real IdP.
const DEMO_ORGS = [
  { slug: "northwind", name: "Northwind Logistics", locale: "en-US" as const },
  { slug: "noerrebro", name: "Nørrebro Fonden", locale: "da-DK" as const },
];

const DEMO_ROLES: { role: MembershipRole; scopes: DomainScope[] }[] = [
  { role: "Admin", scopes: ["people", "finance", "strategy", "operations"] },
  { role: "Executive", scopes: ["people", "finance", "strategy", "operations"] },
  { role: "HR", scopes: ["people"] },
  { role: "Manager", scopes: ["people", "operations"] },
  { role: "Contributor", scopes: ["strategy"] },
  { role: "Viewer", scopes: [] },
];

const SAMPLE_RECORDS: { type: "briefing" | "finding" | "playbook"; domain: DomainScope; templateKey: string; params: Record<string, string | number> }[] = [
  {
    type: "briefing",
    domain: "people",
    templateKey: "briefing.weekly",
    params: { weekStart: "2026-01-05", headlineCount: 3, metricName: "retention", trendDirection: "up", trendValue: 4 },
  },
  {
    type: "finding",
    domain: "finance",
    templateKey: "finding.metric",
    params: { metricName: "operating margin", value: 18, unit: "%", trendDirection: "up", trendValue: 2, affectedCount: 4 },
  },
  {
    type: "playbook",
    domain: "strategy",
    templateKey: "playbook.action",
    params: { playbookName: "Q1 focus reset", teamName: "Growth", actionCount: 3, metricName: "pipeline coverage", windowDays: 14 },
  },
];

export async function seedDemoWorld() {
  const summary: { orgSlug: string; orgId: string; userIds: Record<string, string> }[] = [];

  for (const orgSeed of DEMO_ORGS) {
    let [org] = await db.select().from(orgs).where(eq(orgs.slug, orgSeed.slug)).limit(1);
    if (!org) {
      [org] = await db
        .insert(orgs)
        .values({
          slug: orgSeed.slug,
          name: orgSeed.name,
          locale: orgSeed.locale,
          terminology: {},
        })
        .returning();
    }

    const userIds: Record<string, string> = {};

    for (const demoRole of DEMO_ROLES) {
      const email = `${demoRole.role.toLowerCase()}@${orgSeed.slug}.leados.demo`;
      let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (!user) {
        [user] = await db
          .insert(users)
          .values({ email, name: `${demoRole.role} (${orgSeed.name})` })
          .returning();
      }
      userIds[demoRole.role] = user.id;

      const existingMembership = await db
        .select()
        .from(memberships)
        .where(eq(memberships.userId, user.id))
        .limit(1);
      if (existingMembership.length === 0) {
        await db.insert(memberships).values({
          orgId: org.id,
          userId: user.id,
          role: demoRole.role,
          scopes: demoRole.scopes,
        });
      }
    }

    const existingRecords = await db
      .select({ id: engineRecords.id })
      .from(engineRecords)
      .where(eq(engineRecords.orgId, org.id))
      .limit(1);

    if (existingRecords.length === 0) {
      await db.insert(engineRecords).values(
        SAMPLE_RECORDS.map((record) => ({
          orgId: org.id,
          type: record.type,
          domain: record.domain,
          templateKey: record.templateKey,
          params: record.params,
          createdBy: userIds.Admin,
          updatedBy: userIds.Admin,
          seeded: true,
        })),
      );
    }

    summary.push({ orgSlug: org.slug, orgId: org.id, userIds });
  }

  return summary;
}
