import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ecosystemNodes, interactions, stakeholders } from "@/db/schema";
import { computeRelationshipHealth, stakeholderQuadrant } from "@/lib/network/stakeholders";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(stakeholders);
  const nodes = await db.select().from(ecosystemNodes);
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
  const typeOf = (id: string) => nodes.find((n) => n.id === id)?.type ?? "partner";

  const results = await Promise.all(
    rows.map(async (s) => {
      const interactionRows = await db
        .select()
        .from(interactions)
        .where(eq(interactions.stakeholderId, s.id));

      const health = computeRelationshipHealth(
        interactionRows.map((i) => ({
          occurredAt: i.occurredAt,
          sentiment: i.sentiment as "positive" | "neutral" | "negative" | null,
        })),
      );

      return {
        id: s.id,
        nodeId: s.nodeId,
        nodeName: nameOf(s.nodeId),
        nodeType: typeOf(s.nodeId),
        interest: s.interest,
        influence: s.influence,
        affectedness: s.affectedness,
        quadrant: stakeholderQuadrant(s.interest, s.influence),
        engagementPlan: s.engagementPlan,
        owner: s.owner,
        relationshipHealth: health,
      };
    }),
  );

  return Response.json({ stakeholders: results });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        nodeId?: string;
        interest?: number;
        influence?: number;
        affectedness?: number;
        engagementPlan?: string;
        owner?: string;
      }
    | null;

  if (!body?.nodeId || body.interest == null || body.influence == null || body.affectedness == null) {
    return Response.json(
      { error: "nodeId, interest, influence, affectedness are required" },
      { status: 400 },
    );
  }

  for (const [key, val] of Object.entries({
    interest: body.interest,
    influence: body.influence,
    affectedness: body.affectedness,
  })) {
    if (val < 0 || val > 10) {
      return Response.json({ error: `${key} must be between 0 and 10` }, { status: 400 });
    }
  }

  const [created] = await db
    .insert(stakeholders)
    .values({
      nodeId: body.nodeId,
      interest: body.interest,
      influence: body.influence,
      affectedness: body.affectedness,
      engagementPlan: body.engagementPlan ?? "",
      owner: body.owner ?? "",
    })
    .returning();

  return Response.json({ stakeholder: created }, { status: 201 });
}
