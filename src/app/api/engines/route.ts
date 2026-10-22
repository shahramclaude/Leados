import { db } from "@/db";
import { engines } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(engines);
  return Response.json({ engines: rows });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.key || !body?.name || !body?.type) {
    return Response.json({ error: "key, name, type are required" }, { status: 400 });
  }
  const [row] = await db
    .insert(engines)
    .values({ key: body.key, name: body.name, type: body.type })
    .returning();
  return Response.json({ engine: row }, { status: 201 });
}
