import { db } from "@/db";
import { decisions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { actorFromHeaders } from "@/lib/roles";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(decisions).orderBy(desc(decisions.createdAt));
  return Response.json({ decisions: rows });
}

export async function POST(req: Request) {
  const actor = actorFromHeaders(req.headers);
  const body = await req.json();

  const required = ["title", "description", "decisionType"];
  for (const key of required) {
    if (!body[key]) return Response.json({ error: `"${key}" is required` }, { status: 400 });
  }

  const [row] = await db
    .insert(decisions)
    .values({
      title: body.title,
      description: body.description,
      decisionType: body.decisionType,
      involvesPeopleData: Boolean(body.involvesPeopleData),
      subjectsHaveVisibility: body.subjectsHaveVisibility ?? true,
      visibilityScope: body.visibilityScope ?? "individual",
      reversibility: body.reversibility ?? "reversible",
      impact: body.impact ?? "low",
      isPowerAction: Boolean(body.isPowerAction),
      powerActionType: body.powerActionType ?? null,
      primarySubjectPersonId: body.primarySubjectPersonId ?? null,
      proposedByPersonId: actor.personId ?? body.proposedByPersonId ?? 1,
      dissentNotes: body.dissentNotes ?? [],
      dissentHidden: Boolean(body.dissentHidden),
      structuredCriteria: body.structuredCriteria ?? null,
    })
    .returning();

  await recordAudit({
    actorId: actor.personId,
    actorRole: actor.role,
    action: "decision.proposed",
    resourceType: "decision",
    resourceId: row.id,
    metadata: { decisionType: row.decisionType },
  });

  return Response.json({ decision: row }, { status: 201 });
}
