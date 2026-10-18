import { db } from "@/db";
import { leados_decisions } from "@/db/schema";
import { desc } from "drizzle-orm";
import { NextRequest } from "next/server";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leados_decisions).orderBy(desc(leados_decisions.openedAt));
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const { title, owner, domain } = await req.json();
  if (!title || !owner || !domain) {
    return Response.json({ error: "title, owner and domain required" }, { status: 400 });
  }
  const [row] = await db.insert(leados_decisions).values({ title, owner, domain }).returning();
  await logAudit("DECISION_ADDED", title);
  return Response.json(row, { status: 201 });
}
