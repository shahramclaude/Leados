import { db } from "@/db";
import { leados_audit } from "@/db/schema";
import { desc } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leados_audit).orderBy(desc(leados_audit.ts)).limit(200);
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const { action, detail } = await req.json();
  await db.insert(leados_audit).values({ action, detail });
  return Response.json({ ok: true });
}
