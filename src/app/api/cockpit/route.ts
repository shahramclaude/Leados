import { db } from "@/db";
import * as schema from "@/db/schema";
import { ensureBaselineData } from "@/lib/seed";
import { withErrorHandling, jsonOk } from "@/lib/api";
import { desc } from "drizzle-orm";
import { LATENT_NODES, defaultObservables, computePosteriors, computeCascadeRisk } from "@/lib/beliefFabric";
import { generateMorningBrief } from "@/lib/agentCycle";
import { buildCriticalPath } from "@/lib/strategicIntel";
import { runMonteCarloRunway } from "@/lib/financialIntel";

export const dynamic = "force-dynamic";

/**
 * Single aggregate endpoint for the cockpit shell. Fetches every
 * cross-domain number the Command Center needs in ONE round trip so
 * CockpitView can render with zero additional fetches once this
 * resolves (data flows through AppContext afterwards).
 */
export const GET = withErrorHandling("cockpit", async (_req, requestId) => {
  await ensureBaselineData(db);

  const [people, findings, hypotheses, projects, playbookInstances, lastRuns] = await Promise.all([
    db.select().from(schema.people),
    db.select().from(schema.findings).orderBy(desc(schema.findings.createdAt)),
    db.select().from(schema.hypotheses),
    db.select().from(schema.projects),
    db.select().from(schema.playbookInstances),
    db.select().from(schema.agentCycleRuns).orderBy(desc(schema.agentCycleRuns.completedAt)).limit(1),
  ]);

  const posteriors = computePosteriors(defaultObservables());
  const cascadeRisk = computeCascadeRisk(posteriors);

  const criticalPath = buildCriticalPath(
    projects.map((p) => ({ id: p.id, name: p.name, durationDays: p.durationDays, dependencies: p.dependencies })),
  );

  const runway = runMonteCarloRunway({ cashBalance: 1_800_000, burnRate: 180_000, revenue: 70_000, revenueGrowth: 0.04 }, 500, 42);

  const atRiskPeople = people.filter((p) => p.flightRiskScore > 0.5);
  const openFindings = findings.filter((f) => f.status === "open");
  const openHypotheses = hypotheses.filter((h) => h.status === "open");

  const brief = generateMorningBrief({
    openFindings: openFindings.length,
    criticalPeopleAtRisk: atRiskPeople.filter((p) => p.isCritical).length,
    cascadeRisk,
  });

  return jsonOk(
    {
      people,
      findings,
      hypotheses,
      projects,
      playbookInstances,
      lastAgentRun: lastRuns[0] ?? null,
      belief: { nodes: LATENT_NODES, posteriors, cascadeRisk },
      criticalPath,
      runway,
      brief,
      summary: {
        peopleCount: people.length,
        atRiskPeopleCount: atRiskPeople.length,
        openFindingsCount: openFindings.length,
        openHypothesesCount: openHypotheses.length,
        projectsCount: projects.length,
      },
    },
    requestId,
  );
});

export const revalidate = 0;
