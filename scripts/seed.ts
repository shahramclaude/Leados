// Optional demo-data seed: creates the demo tenant, a handful of leads with
// deterministic scores, a few knowledge entries, and an initial forecast
// pass. Safe to re-run (it only adds rows; it does not delete existing data).
import "dotenv/config";
import { db, pool } from "../src/db";
import { leads, knowledgeEntries, forecasts } from "../src/db/schema";
import { getOrCreateDemoTenant } from "../src/lib/tenant";
import { computeScore, type TitleSeniority } from "../src/lib/scoring";
import { computeForecast, currentPeriod, isStage } from "../src/lib/forecast";
import { appendDecision } from "../src/lib/ledger";

const DEMO_LEADS: Array<{
  name: string;
  company: string;
  title: string;
  email: string;
  budget: number;
  dealValue: number;
  companySize: number;
  engagementScore: number;
  titleSeniority: TitleSeniority;
  icpFit: number;
  responseHistory: number;
  stage: string;
}> = [
  {
    name: "Dana Whitfield",
    company: "Northbeam Logistics",
    title: "Chief Operating Officer",
    email: "dana@northbeam.example",
    budget: 220000,
    dealValue: 180000,
    companySize: 1200,
    engagementScore: 82,
    titleSeniority: "c_suite",
    icpFit: 88,
    responseHistory: 76,
    stage: "proposal",
  },
  {
    name: "Marco Villeneuve",
    company: "Hallway Robotics",
    title: "VP of Engineering",
    email: "marco@hallwayrobotics.example",
    budget: 95000,
    dealValue: 95000,
    companySize: 340,
    engagementScore: 64,
    titleSeniority: "vp",
    icpFit: 72,
    responseHistory: 55,
    stage: "qualified",
  },
  {
    name: "Priya Anand",
    company: "Fernhollow Health",
    title: "Director of Revenue Operations",
    email: "priya@fernhollow.example",
    budget: 60000,
    dealValue: 60000,
    companySize: 800,
    engagementScore: 48,
    titleSeniority: "director",
    icpFit: 60,
    responseHistory: 40,
    stage: "contacted",
  },
  {
    name: "Ola Nilsson",
    company: "Brightline Freight",
    title: "Sales Manager",
    email: "ola@brightline.example",
    budget: 18000,
    dealValue: 18000,
    companySize: 120,
    engagementScore: 30,
    titleSeniority: "manager",
    icpFit: 40,
    responseHistory: 25,
    stage: "new",
  },
  {
    name: "Satoshi Endo",
    company: "Granite Peak Finance",
    title: "Chief Executive Officer",
    email: "satoshi@granitepeak.example",
    budget: 500000,
    dealValue: 420000,
    companySize: 5200,
    engagementScore: 91,
    titleSeniority: "c_suite",
    icpFit: 95,
    responseHistory: 88,
    stage: "negotiation",
  },
];

const DEMO_KNOWLEDGE: Array<{
  title: string;
  body: string;
  category: "measured" | "estimated" | "association" | "effect";
  tags: string[];
}> = [
  {
    title: "Mid-market logistics accounts respond fastest to ROI calculators",
    body: "Across the last two quarters, logistics accounts that received a tailored ROI calculator in the first touch replied 2.1x more often than those that received a generic deck.",
    category: "measured",
    tags: ["logistics", "playbook"],
  },
  {
    title: "C-suite buyers in fintech likely prioritize audit-trail features",
    body: "Several fintech executive conversations have surfaced compliance and audit trail as a recurring concern, though this hasn't been validated across a statistically significant sample yet.",
    category: "estimated",
    tags: ["fintech", "compliance"],
  },
  {
    title: "Longer sales cycles correlate with multi-stakeholder deals",
    body: "Deals involving 3+ stakeholders have historically taken 40% longer to close, though causation hasn't been isolated from deal size as a confound.",
    category: "association",
    tags: ["sales-cycle"],
  },
  {
    title: "Adding a named executive sponsor shortens proposal-to-close time",
    body: "In a controlled pilot, deals with a named internal executive sponsor closed on average 12 days faster than those without one.",
    category: "effect",
    tags: ["sponsorship", "velocity"],
  },
];

async function main() {
  const tenant = await getOrCreateDemoTenant();
  console.log(`Seeding demo data for tenant ${tenant.slug} (${tenant.id})`);

  for (const demoLead of DEMO_LEADS) {
    const { total, breakdown } = computeScore({
      budget: demoLead.budget,
      companySize: demoLead.companySize,
      engagementScore: demoLead.engagementScore,
      titleSeniority: demoLead.titleSeniority,
      icpFit: demoLead.icpFit,
      responseHistory: demoLead.responseHistory,
    });

    const [lead] = await db
      .insert(leads)
      .values({
        tenantId: tenant.id,
        name: demoLead.name,
        company: demoLead.company,
        title: demoLead.title,
        email: demoLead.email,
        budget: String(demoLead.budget),
        dealValue: String(demoLead.dealValue),
        companySize: demoLead.companySize,
        engagementScore: demoLead.engagementScore,
        titleSeniority: demoLead.titleSeniority,
        icpFit: demoLead.icpFit,
        responseHistory: demoLead.responseHistory,
        stage: demoLead.stage,
        score: total,
        scoreBreakdown: breakdown,
      })
      .returning();

    await appendDecision({
      tenantId: tenant.id,
      entityType: "lead",
      entityId: lead.id,
      action: "lead.created",
      payload: { score: total, breakdown },
      rationale: `Seeded lead "${lead.name}" at ${lead.company}, scored ${total}/100.`,
    });

    const stage = isStage(lead.stage) ? lead.stage : "new";
    const forecastResult = computeForecast({
      stage,
      score: lead.score,
      dealValue: Number(lead.dealValue),
    });

    const [forecast] = await db
      .insert(forecasts)
      .values({
        tenantId: tenant.id,
        leadId: lead.id,
        period: currentPeriod(),
        stageAtForecast: stage,
        scoreAtForecast: lead.score,
        probability: String(forecastResult.probability),
        dealValue: String(Number(lead.dealValue)),
        weightedValue: String(forecastResult.weightedValue),
        method: forecastResult.method,
        rationale: forecastResult.rationale,
      })
      .returning();

    await appendDecision({
      tenantId: tenant.id,
      entityType: "forecast",
      entityId: forecast.id,
      action: "forecast.computed",
      payload: {
        leadId: lead.id,
        period: forecast.period,
        probability: forecastResult.probability,
        weightedValue: forecastResult.weightedValue,
      },
      rationale: `Seeded forecast for "${lead.name}": ${forecastResult.rationale}`,
    });

    console.log(`  + ${lead.name} (${lead.company}) — score ${total}, forecast ${forecastResult.probability}%`);
  }

  for (const entry of DEMO_KNOWLEDGE) {
    await db.insert(knowledgeEntries).values({
      tenantId: tenant.id,
      title: entry.title,
      body: entry.body,
      category: entry.category,
      tags: entry.tags,
    });
    console.log(`  + knowledge entry: ${entry.title}`);
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
