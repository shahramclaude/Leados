import { db } from "@/db";
import { people as peopleTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runOrchestrator, recentEventsForPerson, getPersonContext } from "@/lib/orchestrator";
import { jsonError, cachedJson, isRecord } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) return jsonError("invalid id");

  const { person } = await getPersonContext(personId);
  if (!person) return jsonError("not found", 404);

  const report = await runOrchestrator();
  const personIntelligence = report.individuals.find((p) => p.personId === personId);
  if (!personIntelligence) return jsonError("not found", 404);

  const recentEvents = await recentEventsForPerson(personId, 5);

  return cachedJson({
    person: personIntelligence,
    roster: { name: person.name, role: person.role, team: person.team, level: person.level },
    recentEvents,
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) return jsonError("invalid id");

  const body: unknown = await request.json();
  if (!isRecord(body)) return jsonError("invalid body");

  const allowed: Record<string, unknown> = {};
  for (const key of [
    "name",
    "role",
    "team",
    "managerId",
    "level",
    "tenureStart",
    "lastPromotedAt",
    "compensationBand",
    "skills",
    "okrScore",
    "archived",
  ]) {
    if (key in body) allowed[key] = body[key];
  }
  if (Object.keys(allowed).length === 0) return jsonError("no updatable fields provided");

  if (typeof allowed.tenureStart === "string") allowed.tenureStart = new Date(allowed.tenureStart);
  if (typeof allowed.lastPromotedAt === "string") allowed.lastPromotedAt = new Date(allowed.lastPromotedAt);

  const [updated] = await db
    .update(peopleTable)
    .set({ ...allowed, updatedAt: new Date() })
    .where(eq(peopleTable.id, personId))
    .returning();
  if (!updated) return jsonError("not found", 404);
  return cachedJson(updated);
}
