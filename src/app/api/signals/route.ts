import { NextResponse } from "next/server";
import { db } from "@/db";
import { signals } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(signals).orderBy(desc(signals.detectedAt));
  return NextResponse.json({ signals: rows });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.title !== "string" || body.title.trim().length === 0) {
    return NextResponse.json({ error: "A signal title is required." }, { status: 400 });
  }

  const [created] = await db
    .insert(signals)
    .values({
      title: body.title.trim(),
      description: typeof body.description === "string" ? body.description : "",
      category: typeof body.category === "string" && body.category.trim() ? body.category.trim() : "General",
      source: typeof body.source === "string" && body.source.trim() ? body.source.trim() : "Manual",
      severity: ["low", "medium", "high", "critical"].includes(body.severity) ? body.severity : "medium",
      status: "active",
    })
    .returning();

  return NextResponse.json({ signal: created }, { status: 201 });
}
