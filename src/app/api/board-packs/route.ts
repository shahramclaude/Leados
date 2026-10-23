import { db } from "@/db";
import { boardPacks } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(boardPacks).orderBy(desc(boardPacks.createdAt));
  return Response.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const period = typeof body.period === "string" ? body.period.trim() : "";
  if (!title || !period) return Response.json({ error: "title and period are required" }, { status: 400 });

  const [created] = await db
    .insert(boardPacks)
    .values({ title, period, summary: body.summary ?? "" })
    .returning();

  return Response.json(created, { status: 201 });
}
