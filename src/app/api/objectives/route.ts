import { db } from "@/db";
import { objectives } from "@/db/schema";
import { getObjectives } from "@/lib/queries";
import { findExistingMutation, recordAudit, recordMutation } from "@/lib/server/idempotency";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rows = await getObjectives({
    status: url.searchParams.get("status") ?? undefined,
    scenarioId: url.searchParams.get("scenarioId") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    sort: (url.searchParams.get("sort") as "updated" | "created" | "title") ?? undefined,
  });
  return Response.json({ items: rows });
}

export async function POST(request: Request) {
  const idempotencyKey = request.headers.get("idempotency-key");
  const body = (await request.json()) as {
    id?: string;
    scenarioId?: string;
    title?: string;
    description?: string;
  };

  if (idempotencyKey) {
    const existing = await findExistingMutation(idempotencyKey);
    if (existing) {
      return Response.json(existing.resultJson, { status: existing.status === "applied" ? 201 : 200 });
    }
  }

  if (!body.title || body.title.trim().length < 3) {
    return Response.json(
      { code: "VALIDATION", message: "Objective title must be at least 3 characters.", field: "title" },
      { status: 422 },
    );
  }
  if (!body.scenarioId) {
    return Response.json(
      { code: "VALIDATION", message: "Select a scenario for this objective.", field: "scenarioId" },
      { status: 422 },
    );
  }

  const [row] = await db
    .insert(objectives)
    .values({
      id: body.id,
      scenarioId: body.scenarioId,
      title: body.title.trim(),
      description: body.description ?? "",
    })
    .returning();

  await recordAudit("objective", row.id, "created", `Objective "${row.title}" created`);
  if (idempotencyKey) await recordMutation(idempotencyKey, "objective", "applied", row);

  return Response.json(row, { status: 201 });
}
