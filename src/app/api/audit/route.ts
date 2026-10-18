import { db } from "@/db";
import { leados_audit } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leados_audit).orderBy(desc(leados_audit.createdAt)).limit(200);
  return Response.json(rows);
}
