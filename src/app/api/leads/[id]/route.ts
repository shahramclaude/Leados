import { db } from "@/db";
import { leads, scoreEvents } from "@/db/schema";
import { computeScore, isValidStatus } from "@/lib/scoring";
import { desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** GET /api/leads/:id — lead plus its last 10 score events. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) return Response.json({ error: "invalid id" }, { status: 400 });

  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  if (!lead) return Response.json({ error: "lead not found" }, { status: 404 });

  const history = await db
    .select()
    .from(scoreEvents)
    .where(eq(scoreEvents.leadId, id))
    .orderBy(desc(scoreEvents.createdAt))
    .limit(10);

  return Response.json({ lead, scoreHistory: history });
}

/**
 * PATCH /api/leads/:id
 * Body may include any of: name, company, source, notes, status.
 * If company, source, or email-relevant fields change, score is recomputed
 * and a score_events row with reason "updated" is written.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) return Response.json({ error: "invalid id" }, { status: 400 });

  const [existing] = await db.select().from(leads).where(eq(leads.id, id));
  if (!existing) return Response.json({ error: "lead not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "request body must be an object" }, { status: 400 });
  }
  const patch = body as Record<string, unknown>;

  if (patch.status !== undefined) {
    if (typeof patch.status !== "string" || !isValidStatus(patch.status)) {
      return Response.json({ error: "invalid status" }, { status: 400 });
    }
  }

  const next = {
    name: typeof patch.name === "string" ? patch.name : existing.name,
    company: typeof patch.company === "string" ? patch.company : existing.company,
    source: typeof patch.source === "string" ? patch.source : existing.source,
    notes: typeof patch.notes === "string" ? patch.notes : existing.notes,
    status: typeof patch.status === "string" ? patch.status : existing.status,
  };

  const rescore =
    next.company !== existing.company || next.source !== existing.source || next.notes !== existing.notes;

  const { score, breakdown, version } = rescore
    ? computeScore({ email: existing.email, company: next.company, source: next.source, notes: next.notes })
    : { score: existing.score, breakdown: existing.scoreBreakdown ?? {}, version: existing.scoreVersion };

  const [updated] = await db
    .update(leads)
    .set({ ...next, score, scoreBreakdown: breakdown, scoreVersion: version, updatedAt: new Date() })
    .where(eq(leads.id, id))
    .returning();

  if (rescore) {
    await db.insert(scoreEvents).values({ leadId: id, score, breakdown, scoreVersion: version, reason: "updated" });
  }

  return Response.json({ lead: updated });
}

/** DELETE /api/leads/:id */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) return Response.json({ error: "invalid id" }, { status: 400 });

  const deleted = await db.delete(leads).where(eq(leads.id, id)).returning();
  if (deleted.length === 0) return Response.json({ error: "lead not found" }, { status: 404 });

  return Response.json({ ok: true });
}
