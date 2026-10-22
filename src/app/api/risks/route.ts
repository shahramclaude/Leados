import { db } from "@/db";
import { risks } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(risks);
  return Response.json({ risks: rows });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.title || !body?.category) {
    return Response.json({ error: "title, category are required" }, { status: 400 });
  }
  const [row] = await db
    .insert(risks)
    .values({
      title: body.title,
      category: body.category,
      likelihood: String(body.likelihood ?? 0.3),
      impact: String(body.impact ?? 0.3),
      beliefScore: String(body.beliefScore ?? 0.3),
    })
    .returning();
  return Response.json({ risk: row }, { status: 201 });
}
