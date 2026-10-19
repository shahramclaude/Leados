import { db } from "@/db";
import { projects as projectsTable } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name,
      domain,
      ownerId,
      startDate,
      targetDate,
      status,
      scopeStatement,
      confidence,
      impact,
    } = body ?? {};

    if (!name || typeof name !== "string") {
      return Response.json({ error: "`name` is required" }, { status: 400 });
    }

    const [created] = await db
      .insert(projectsTable)
      .values({
        name,
        domain: domain ?? null,
        ownerId: ownerId ?? null,
        startDate: startDate ? new Date(startDate) : null,
        targetDate: targetDate ? new Date(targetDate) : null,
        status: status ?? "planning",
        scopeStatement: scopeStatement ?? "",
        confidence: confidence ?? 50,
        impact: impact ?? 3,
      })
      .returning();

    return Response.json(created, { status: 201 });
  } catch (err) {
    console.error("POST /api/execution/projects failed", err);
    return Response.json({ error: "Failed to create project" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const rows = await db.select().from(projectsTable);
    return Response.json(rows);
  } catch (err) {
    console.error("GET /api/execution/projects failed", err);
    return Response.json({ error: "Failed to load projects" }, { status: 500 });
  }
}
