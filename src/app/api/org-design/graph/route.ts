import { db } from "@/db";
import { orgEdges, orgPeople, orgUnits } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const units = await db.select().from(orgUnits);
  const edges = await db.select().from(orgEdges);
  const people = await db.select().from(orgPeople);
  return Response.json({ units, edges, people });
}
