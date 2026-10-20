import { db } from "@/db";
import { decisions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(decisions).orderBy(desc(decisions.severity));
  return Response.json({ decisions: rows });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== "string" || body.title.trim().length === 0) {
    return Response.json({ error: "A title is required." }, { status: 400 });
  }

  const dueDate = body.dueDate ? new Date(body.dueDate) : new Date(Date.now() + 7 * 86400000);
  const [created] = await db
    .insert(decisions)
    .values({
      title: body.title.trim(),
      description: body.description?.trim() || "No additional context provided.",
      track: body.track === "strategic" ? "strategic" : "execution",
      category: body.category?.trim() || "General",
      status: "pending",
      owner: body.owner?.trim() || "Unassigned",
      severity: Number.isFinite(body.severity) ? Math.min(5, Math.max(1, Math.round(body.severity))) : 3,
      financialImpact: String(Number.isFinite(body.financialImpact) ? body.financialImpact : 0),
      dueDate,
    })
    .returning();

  return Response.json({ decision: created }, { status: 201 });
}
