import { db } from "@/db";
import { leados_work_queue } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await db.select().from(leados_work_queue).orderBy(desc(leados_work_queue.created_at));
  return Response.json(items);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const [item] = await db
    .insert(leados_work_queue)
    .values({ type: body.type, title: body.title, payload: body.payload ?? {} })
    .returning();
  return Response.json(item, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, status } = body;
  if (!["accepted", "dismissed"].includes(status)) {
    return Response.json({ error: "invalid status" }, { status: 400 });
  }
  const [updated] = await db
    .update(leados_work_queue)
    .set({ status, resolved_at: new Date() })
    .where(eq(leados_work_queue.id, id))
    .returning();
  return Response.json(updated);
}
