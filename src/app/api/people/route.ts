import { db } from "@/db";
import { leados_people } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leados_people).orderBy(desc(leados_people.createdAt));
  return Response.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.name) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  const [row] = await db
    .insert(leados_people)
    .values({ name: body.name, role: body.role ?? "", email: body.email ?? "" })
    .returning();
  return Response.json(row, { status: 201 });
}
