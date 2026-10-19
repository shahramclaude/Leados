import { db } from "@/db";
import * as schema from "@/db/schema";
import { ensureBaselineData } from "@/lib/seed";
import { withErrorHandling, jsonOk } from "@/lib/api";
import {
  computeFlightRisk,
  buildNineBox,
  computeSuccessionRisk,
  buildTeamChemistryReport,
  type Person,
} from "@/lib/peopleIntel";

export const dynamic = "force-dynamic";

export const GET = withErrorHandling("people", async (_req, requestId) => {
  await ensureBaselineData(db);
  const rows = await db.select().from(schema.people);

  const people: Person[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    department: r.department,
    managerId: r.managerId,
    performanceScore: r.performanceScore,
    potentialScore: r.potentialScore,
    flightRiskScore: r.flightRiskScore,
    burnoutRiskScore: r.burnoutRiskScore,
    tenureMonths: r.tenureMonths,
    skills: r.skills,
    isCritical: r.isCritical,
  }));

  const nineBox = buildNineBox(people);
  const succession = people.map((p) => computeSuccessionRisk(p, people));
  const chemistry = buildTeamChemistryReport(people);
  const computedFlightRisk = people.map((p) => ({ id: p.id, flightRisk: computeFlightRisk(p) }));

  return jsonOk(
    {
      people,
      nineBox,
      succession,
      chemistry,
      computedFlightRisk,
    },
    requestId,
  );
});
