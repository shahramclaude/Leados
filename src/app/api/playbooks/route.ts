import { db } from "@/db";
import { playbooks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cachedJson, jsonError, isRecord } from "@/lib/api";
import type { PlaybookStep } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const rows = await db.select().from(playbooks).orderBy(playbooks.dueDate);
  return cachedJson(rows);
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.name !== "string" || body.name.trim() === "") {
    return jsonError("name is required");
  }
  if (typeof body.domain !== "string" || body.domain.trim() === "") {
    return jsonError("domain is required");
  }
  const steps: PlaybookStep[] = Array.isArray(body.steps)
    ? body.steps
        .filter((s): s is { text: string } => isRecord(s) && typeof s.text === "string")
        .map((s) => ({ text: s.text, done: false }))
    : [];
  const [created] = await db
    .insert(playbooks)
    .values({
      name: body.name,
      description: typeof body.description === "string" ? body.description : "",
      domain: body.domain,
      dueDate: typeof body.dueDate === "string" && body.dueDate !== "" ? new Date(body.dueDate) : null,
      steps,
    })
    .returning();
  return cachedJson(created, { status: 201 });
}

export async function PATCH(request: Request): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.id !== "number") return jsonError("id is required");
  const patch: Partial<typeof playbooks.$inferInsert> = {};
  if (typeof body.status === "string") patch.status = body.status;
  if (Array.isArray(body.steps)) {
    patch.steps = body.steps.filter(
      (s): s is PlaybookStep => isRecord(s) && typeof s.text === "string" && typeof s.done === "boolean"
    );
  }
  const [updated] = await db.update(playbooks).set(patch).where(eq(playbooks.id, body.id)).returning();
  if (!updated) return jsonError("playbook not found", 404);
  return cachedJson(updated);
}
