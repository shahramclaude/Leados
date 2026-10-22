import { db } from "@/db";
import { strategyItems } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(strategyItems);
  return Response.json({ strategyItems: rows });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.title || !body?.owner) {
    return Response.json({ error: "title, owner are required" }, { status: 400 });
  }
  const [row] = await db
    .insert(strategyItems)
    .values({
      title: body.title,
      owner: body.owner,
      status: body.status ?? "proposed",
      priority: body.priority ?? "medium",
    })
    .returning();
  return Response.json({ strategyItem: row }, { status: 201 });
}
