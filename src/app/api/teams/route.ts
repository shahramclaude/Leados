import { db } from "@/db";
import { teams } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(teams);
  return Response.json({ teams: rows });
}
