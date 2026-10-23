// Self-first view: a person always sees their own human-impact entries,
// regardless of whether the org-wide announcement has happened yet.

import { db } from "@/db";
import { humanImpactEntries, orgPeople, supportPlans } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const personId = Number(url.searchParams.get("personId"));
  if (!Number.isFinite(personId)) {
    return Response.json({ ok: false, error: "personId query param is required" }, { status: 400 });
  }

  const entries = await db.select().from(humanImpactEntries).where(eq(humanImpactEntries.personId, personId));
  const plans = await db.select().from(supportPlans);
  const plansById = new Map(plans.map((p) => [p.id, p]));
  const [person] = await db.select().from(orgPeople).where(eq(orgPeople.id, personId));

  return Response.json({
    ok: true,
    person: person ?? null,
    entries: entries.map((e) => ({
      ...e,
      supportPlan: e.supportPlanId ? plansById.get(e.supportPlanId) ?? null : null,
      visibilityNote: "Visible to you as soon as the simulation runs — before any org-wide announcement (self-first policy).",
    })),
  });
}
