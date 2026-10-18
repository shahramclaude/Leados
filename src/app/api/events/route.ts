import { db } from "@/db";
import { leados_events } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const personId = url.searchParams.get("personId");

  const rows = personId
    ? await db
        .select()
        .from(leados_events)
        .where(eq(leados_events.personId, Number(personId)))
        .orderBy(desc(leados_events.occurredAt))
    : await db.select().from(leados_events).orderBy(desc(leados_events.occurredAt));

  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { type, domain, personId, data, occurredAt } = body ?? {};

  if (!type || typeof type !== "string") {
    return Response.json({ error: "type is required" }, { status: 400 });
  }

  const [created] = await db
    .insert(leados_events)
    .values({
      type,
      domain: typeof domain === "string" ? domain : "people",
      personId: typeof personId === "number" ? personId : null,
      data: typeof data === "object" && data ? data : {},
      occurredAt: typeof occurredAt === "string" ? new Date(occurredAt) : new Date(),
    })
    .returning();

  return Response.json(created, { status: 201 });
}
