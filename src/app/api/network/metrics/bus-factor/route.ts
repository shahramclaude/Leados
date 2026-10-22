import { eq } from "drizzle-orm";
import { db } from "@/db";
import { people, skillCoverage } from "@/db/schema";
import { busFactor } from "@/lib/network/metrics";
import { evaluateBusFactorAlert } from "@/lib/network/alerts";
import { recordAlertIfNew } from "@/lib/network/alertStore";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const capability = searchParams.get("capability");
  const required = Number(searchParams.get("required") ?? "0");

  if (!capability) {
    const rows = await db.select({ capability: skillCoverage.capability }).from(skillCoverage);
    const capabilities = [...new Set(rows.map((r) => r.capability))];
    return Response.json({ capabilities });
  }

  const coverageRows = await db
    .select()
    .from(skillCoverage)
    .where(eq(skillCoverage.capability, capability));

  if (coverageRows.length === 0) {
    return Response.json({ error: `no coverage data for capability "${capability}"` }, { status: 404 });
  }

  const totalCapacity = coverageRows.reduce((acc, r) => acc + Number(r.capacity), 0);
  const requiredCapacity = required > 0 ? required : totalCapacity * 0.6; // default: 60% of total capacity

  const coverage = coverageRows.map((r) => ({
    personId: r.personId,
    capacity: Number(r.capacity),
    isPrimary: r.isPrimary,
  }));

  const result = busFactor(capability, coverage, requiredCapacity);

  const peopleRows = await db.select().from(people);
  const nameOf = (id: string) => peopleRows.find((p) => p.id === id)?.name ?? id;

  const alertDraft = evaluateBusFactorAlert(result);
  const alert = alertDraft ? await recordAlertIfNew(alertDraft) : null;

  return Response.json({
    ...result,
    criticalPeopleNamed: result.criticalPeople.map((id) => ({ id, name: nameOf(id) })),
    alertFired: alert,
  });
}
