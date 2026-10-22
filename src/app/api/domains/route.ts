import { db } from "@/db";
import { domains } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(domains);
  return Response.json({ domains: rows });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body?.key || !body?.name || !body?.category) {
    return Response.json({ error: "key, name, category are required" }, { status: 400 });
  }
  const [row] = await db
    .insert(domains)
    .values({ key: body.key, name: body.name, category: body.category })
    .returning();
  return Response.json({ domain: row }, { status: 201 });
}
