import { db } from "@/db";
import { leados_events, leados_decisions } from "@/db/schema";
import { logAudit } from "@/lib/leados/audit";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leados_events).orderBy(desc(leados_events.createdAt)).limit(200);
  return Response.json(rows);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, domain, personId, data } = body ?? {};
    if (!type) return Response.json({ error: "type is required" }, { status: 400 });

    // Decisions are modeled as a dedicated table, but per the spec the client
    // posts them through the generic events endpoint with type === 'decision'.
    if (type === "decision") {
      const title = data?.title ?? "Untitled decision";
      const owner = data?.owner ?? "";
      const openedAt = data?.openedAt ? new Date(data.openedAt) : new Date();
      const [row] = await db
        .insert(leados_decisions)
        .values({ title, owner, domain: domain ?? "gov", openedAt, status: "open" })
        .returning();
      await logAudit("DECISION_OPENED", `${title} (owner: ${owner})`);
      return Response.json(row, { status: 201 });
    }

    const [row] = await db
      .insert(leados_events)
      .values({ type, domain: domain ?? "people", personId: personId ?? null, data: data ?? {} })
      .returning();
    await logAudit("EVENT_LOGGED", `${type}${personId ? ` for person #${personId}` : ""}`);
    return Response.json(row, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err?.message ?? "failed to create event" }, { status: 500 });
  }
}
