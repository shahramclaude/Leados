import { db } from "@/db";
import { signals } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(signals).orderBy(desc(signals.detectedAt));
  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return Response.json({ error: "title is required" }, { status: 400 });

  const [created] = await db
    .insert(signals)
    .values({
      title,
      source: body.source ?? "internal",
      category: body.category ?? "market",
      severity: body.severity ?? "medium",
      description: body.description ?? "",
    })
    .returning();

  return Response.json(created, { status: 201 });
}
