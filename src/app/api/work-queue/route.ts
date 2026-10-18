import { db } from "@/db";
import { leados_work_queue } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(leados_work_queue).orderBy(desc(leados_work_queue.createdAt));
  return Response.json(rows);
}
