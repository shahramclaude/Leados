import { db } from "@/db";
import { signals } from "@/db/schema";
import { desc } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(signals).orderBy(desc(signals.detectedAt));
  return Response.json({ data: rows });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.title || !body?.source) {
    return Response.json({ error: "title and source are required" }, { status: 400 });
  }
  const [row] = await db
    .insert(signals)
    .values({
      title: body.title,
      description: body.description ?? null,
      source: body.source,
      severity: body.severity ?? "medium",
      status: body.status ?? "new",
    })
    .returning();
  return Response.json({ data: row }, { status: 201 });
}
