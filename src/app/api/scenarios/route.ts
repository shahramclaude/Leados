import { db } from "@/db";
import { scenarios } from "@/db/schema";
import { getScenarios } from "@/lib/queries";
import { recordAudit } from "@/lib/server/idempotency";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await getScenarios();
  return Response.json({ items: rows });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; description?: string };
  if (!body.name || body.name.trim().length < 2) {
    return Response.json(
      { code: "VALIDATION", message: "Scenario name must be at least 2 characters." },
      { status: 422 },
    );
  }
  const [row] = await db
    .insert(scenarios)
    .values({ name: body.name.trim(), description: body.description ?? "" })
    .returning();
  await recordAudit("scenario", row.id, "created", `Scenario "${row.name}" created`);
  return Response.json(row, { status: 201 });
}
