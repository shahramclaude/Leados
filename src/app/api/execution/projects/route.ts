import { db } from "@/db";
import { projects } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(projects);
  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.name !== "string" || typeof body.domain !== "string") {
    return Response.json({ error: "name and domain are required" }, { status: 400 });
  }

  const [created] = await db
    .insert(projects)
    .values({
      name: body.name,
      domain: body.domain,
      ownerId: typeof body.ownerId === "number" ? body.ownerId : null,
      startDate: body.startDate ? new Date(body.startDate) : null,
      targetDate: body.targetDate ? new Date(body.targetDate) : null,
      status: ["planning", "active", "blocked", "complete"].includes(body.status)
        ? body.status
        : "planning",
      confidence:
        typeof body.confidence === "number" ? Math.max(0, Math.min(100, body.confidence)) : 100,
    })
    .returning();

  return Response.json(created, { status: 201 });
}
