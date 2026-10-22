import { db } from "@/db";
import { leads } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireInternalOrgId } from "@/lib/tenant";
import { handleRouteError, jsonError } from "@/lib/api-response";
import { writeWithEnvelope } from "@/lib/envelope";
import { makeExplain } from "@/lib/explain";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const orgId = requireInternalOrgId(req);
    const rows = await db.select().from(leads).where(eq(leads.orgId, orgId)).orderBy(desc(leads.createdAt));
    const data = rows.map((lead) => ({
      ...lead,
      scoreExplain: makeExplain({
        value: lead.score ? Number(lead.score) : 0,
        confidence: lead.scoreConfidence ? Number(lead.scoreConfidence) : 0,
        basis: lead.score ? ["stored score from last signal ingest/agent run"] : ["no score computed yet"],
        generatedBy: "system",
      }),
    }));
    return Response.json({ ok: true, leads: data });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const orgId = requireInternalOrgId(req);
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const company = typeof body.company === "string" ? body.company.trim() : "";
    if (!name || !company) {
      return jsonError('"name" and "company" are required', 400);
    }
    const email = typeof body.email === "string" ? body.email.trim() : null;

    const lead = await writeWithEnvelope({
      orgId,
      actorType: "human",
      actorId: req.headers.get("x-actor-id") ?? "unknown-human",
      entityType: "lead",
      entityId: (result) => String((result as { id: number }).id),
      action: "lead.create",
      reason: "manual lead creation",
      mutate: async () => {
        const [row] = await db.insert(leads).values({ orgId, name, company, email }).returning();
        return row;
      },
      after: (row) => row,
    });

    return Response.json({ ok: true, lead }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
