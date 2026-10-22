import { desc } from "drizzle-orm";
import { db } from "@/db";
import { commitments, ecosystemNodes, stakeholders } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(commitments).orderBy(desc(commitments.createdAt));
  const stakeholderRows = await db.select().from(stakeholders);
  const nodes = await db.select().from(ecosystemNodes);

  const results = rows.map((c) => {
    const stakeholder = stakeholderRows.find((s) => s.id === c.stakeholderId);
    const node = stakeholder ? nodes.find((n) => n.id === stakeholder.nodeId) : undefined;
    const overdue =
      c.status === "open" || c.status === "in_progress"
        ? !!c.dueDate && c.dueDate.getTime() < Date.now()
        : false;
    return {
      ...c,
      stakeholderNodeName: node?.name ?? null,
      overdue,
    };
  });

  return Response.json({ commitments: results });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        stakeholderId?: string;
        description?: string;
        promisedBy?: string;
        dueDate?: string;
        evidenceClass?: "verified_primary" | "verified_secondary" | "self_reported" | "inferred";
        evidenceRefs?: string[];
      }
    | null;

  if (!body?.stakeholderId || !body?.description || !body?.promisedBy) {
    return Response.json(
      { error: "stakeholderId, description, promisedBy are required" },
      { status: 400 },
    );
  }

  const [created] = await db
    .insert(commitments)
    .values({
      stakeholderId: body.stakeholderId,
      description: body.description,
      promisedBy: body.promisedBy,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      evidenceClass: body.evidenceClass ?? "self_reported",
      evidenceRefs: body.evidenceRefs ?? [],
    })
    .returning();

  return Response.json({ commitment: created }, { status: 201 });
}
