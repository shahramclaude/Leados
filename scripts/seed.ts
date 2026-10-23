// Idempotent demo-data seed for the LEADOS founding build.
// Run with: npx tsx scripts/seed.ts

import "dotenv/config";
import { db } from "../src/db";
import { knowledgeEntries, leads } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { getOrCreateDefaultTenant } from "../src/lib/tenant";
import { scoreLead, type LeadAttributes } from "../src/lib/scoring";
import { appendDecision } from "../src/lib/ledger";

async function main() {
  const tenant = await getOrCreateDefaultTenant();
  if (!tenant) throw new Error("could not create default tenant");

  const [existingLeads] = await db
    .select()
    .from(leads)
    .where(eq(leads.tenantId, tenant.id))
    .limit(1);

  if (!existingLeads) {
    const sampleLeads: Array<{
      name: string;
      company: string;
      email: string;
      source: string;
      attributes: LeadAttributes;
    }> = [
      {
        name: "Priya Shah",
        company: "Horizon Freight",
        email: "priya.shah@horizonfreight.com",
        source: "inbound",
        attributes: {
          budget: 85000,
          employees: 1200,
          engagement: 82,
          titleSeniority: "vp",
          icpFit: 90,
          responded: true,
        },
      },
      {
        name: "Marcus Lee",
        company: "Beacon Analytics",
        email: "marcus.lee@beaconanalytics.io",
        source: "outbound",
        attributes: {
          budget: 15000,
          employees: 60,
          engagement: 35,
          titleSeniority: "manager",
          icpFit: 55,
          responded: false,
        },
      },
      {
        name: "Elena Novak",
        company: "Cascade Partners",
        email: "elena.novak@cascadepartners.com",
        source: "referral",
        attributes: {
          budget: 42000,
          employees: 400,
          engagement: 64,
          titleSeniority: "director",
          icpFit: 72,
          responded: true,
        },
      },
      {
        name: "Tom Okafor",
        company: "Ironleaf Manufacturing",
        email: "tom.okafor@ironleaf.com",
        source: "event",
        attributes: {
          budget: 5000,
          employees: 25,
          engagement: 20,
          titleSeniority: "individual_contributor",
          icpFit: 30,
          responded: false,
        },
      },
    ];

    for (const sample of sampleLeads) {
      const result = scoreLead(sample.attributes);
      const [created] = await db
        .insert(leads)
        .values({
          tenantId: tenant.id,
          name: sample.name,
          company: sample.company,
          email: sample.email,
          source: sample.source,
          attributes: sample.attributes,
          score: result.score,
          scoreBreakdown: result.breakdown,
        })
        .returning();

      await appendDecision({
        tenantId: tenant.id,
        subjectType: "lead",
        subjectId: created.id,
        title: `Scored lead "${created.name}" at ${created.company}`,
        rationale: `Deterministic scoring engine produced ${result.score}/100 (${result.label}) during seed import.`,
        outcome: result.label,
        confidence: 90,
        confidenceLabel: "measured",
        evidence: result.breakdown as unknown[],
        actor: "seed-script",
      });
    }
    console.log(`Seeded ${sampleLeads.length} leads.`);
  } else {
    console.log("Leads already seeded, skipping.");
  }

  const [existingKnowledge] = await db
    .select()
    .from(knowledgeEntries)
    .where(eq(knowledgeEntries.tenantId, tenant.id))
    .limit(1);

  if (!existingKnowledge) {
    await db.insert(knowledgeEntries).values([
      {
        tenantId: tenant.id,
        title: "Qualification playbook: VP+ with responded engagement",
        category: "playbook",
        content:
          "Leads with VP-or-above seniority who have responded at least once convert at a measurably higher rate in the historical pipeline. Prioritize scheduling a call within 48 hours.",
        tags: ["qualification", "sales"],
        source: "seed",
        confidenceLabel: "measured",
      },
      {
        tenantId: tenant.id,
        title: "Budget threshold hypothesis",
        category: "finding",
        content:
          "Deals with an estimated budget above $50k appear to close faster, but the sample size is still small — treat this as a working hypothesis, not a rule.",
        tags: ["budget", "hypothesis"],
        source: "seed",
        confidenceLabel: "association",
      },
    ]);
    console.log("Seeded knowledge entries.");
  } else {
    console.log("Knowledge already seeded, skipping.");
  }

  console.log("Seed complete for tenant:", tenant.slug);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
