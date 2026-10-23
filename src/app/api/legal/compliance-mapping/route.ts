import { db } from "@/db";
import { complianceMappings } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(complianceMappings);
  return Response.json({ mappings: rows });
}
