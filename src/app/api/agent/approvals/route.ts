import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { approvals } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status");
  const rows = statusFilter
    ? await db.select().from(approvals).where(eq(approvals.status, statusFilter)).orderBy(asc(approvals.id))
    : await db.select().from(approvals).orderBy(asc(approvals.id));
  return Response.json({ approvals: rows });
}
