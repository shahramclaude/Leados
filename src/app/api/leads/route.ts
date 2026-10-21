import { db } from "@/db";
import { leads, scoreEvents } from "@/db/schema";
import { computeScore } from "@/lib/scoring";
import { desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/leads
 * Optional query param: ?status=qualified
 * Returns all leads ordered by score (descending). See docs/reference.md
 * "API families" for the full contract.
 */
export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status");

  const rows = status
    ? await db.select().from(leads).where(eq(leads.status, status)).orderBy(desc(leads.score))
    : await db.select().from(leads).orderBy(desc(leads.score));

  return Response.json({ leads: rows });
}

/**
 * POST /api/leads
 * Body: { name, email, company?, source?, notes? }
 * Creates a lead and computes its initial score (rule-v1), recording a
 * score_events row with reason "created".
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Request body must be an object" }, { status: 400 });
  }

  const { name, email, company, source, notes } = body as Record<string, unknown>;

  if (typeof name !== "string" || name.trim().length === 0) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  if (typeof email !== "string" || !email.includes("@")) {
    return Response.json({ error: "a valid email is required" }, { status: 400 });
  }

  const { score, breakdown, version } = computeScore({
    email,
    company: typeof company === "string" ? company : undefined,
    source: typeof source === "string" ? source : undefined,
    notes: typeof notes === "string" ? notes : undefined,
  });

  try {
    const [created] = await db
      .insert(leads)
      .values({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        company: typeof company === "string" ? company : null,
        source: typeof source === "string" ? source : "unknown",
        notes: typeof notes === "string" ? notes : null,
        score,
        scoreBreakdown: breakdown,
        scoreVersion: version,
      })
      .returning();

    await db.insert(scoreEvents).values({
      leadId: created.id,
      score,
      breakdown,
      scoreVersion: version,
      reason: "created",
    });

    return Response.json({ lead: created }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    if (message.includes("leads_email_unique_idx")) {
      return Response.json({ error: "a lead with this email already exists" }, { status: 409 });
    }
    return Response.json({ error: "failed to create lead" }, { status: 500 });
  }
}
