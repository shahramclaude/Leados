import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { hypotheses as hypothesesTable } from "@/db/schema";
import { DOMAINS, type Domain, type Hypothesis } from "@/lib/types";

export const dynamic = "force-dynamic";

function toHypothesis(row: typeof hypothesesTable.$inferSelect): Hypothesis {
  const now = Date.now();
  const resolveBy = row.resolveBy.getTime();
  const daysToResolve = Math.ceil((resolveBy - now) / 86400000);
  return {
    id: row.id,
    statement: row.statement,
    domain: row.domain,
    status: row.status,
    openedAt: row.openedAt.toISOString(),
    resolveBy: row.resolveBy.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    outcome: row.outcome,
    daysToResolve,
  };
}

export async function GET() {
  try {
    const rows = await db.select().from(hypothesesTable).orderBy(desc(hypothesesTable.openedAt));
    return NextResponse.json(rows.map(toHypothesis));
  } catch (error) {
    console.error("GET /api/hypothesis failed", error);
    return NextResponse.json({ error: "Failed to load hypotheses" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      statement?: string;
      domain?: Domain;
      resolveInDays?: number;
    };
    if (!body.statement || !body.domain || !DOMAINS.includes(body.domain)) {
      return NextResponse.json({ error: "statement and domain are required" }, { status: 400 });
    }
    const resolveInDays = body.resolveInDays ?? 7;
    const now = new Date();
    const [row] = await db
      .insert(hypothesesTable)
      .values({
        statement: body.statement,
        domain: body.domain,
        status: "open",
        openedAt: now,
        resolveBy: new Date(now.getTime() + resolveInDays * 86400000),
      })
      .returning();
    return NextResponse.json(toHypothesis(row), { status: 201 });
  } catch (error) {
    console.error("POST /api/hypothesis failed", error);
    return NextResponse.json({ error: "Failed to create hypothesis" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: number;
      status?: "confirmed" | "refuted";
      outcome?: string;
    };
    if (!body.id || !body.status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 });
    }
    const [row] = await db
      .update(hypothesesTable)
      .set({ status: body.status, outcome: body.outcome ?? null, resolvedAt: new Date() })
      .where(eq(hypothesesTable.id, body.id))
      .returning();
    if (!row) {
      return NextResponse.json({ error: "Hypothesis not found" }, { status: 404 });
    }
    return NextResponse.json(toHypothesis(row));
  } catch (error) {
    console.error("PATCH /api/hypothesis failed", error);
    return NextResponse.json({ error: "Failed to update hypothesis" }, { status: 500 });
  }
}
