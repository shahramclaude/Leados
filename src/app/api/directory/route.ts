import { db } from "@/db";
import { people } from "@/db/schema";

export const dynamic = "force-dynamic";

// Plain org directory (names + roles) for the demo actor picker. No
// sensitive data lives here — this is the public parts of the Part 31
// stakeholder graph nodes, not the safe channel.
export async function GET() {
  const rows = await db.select({ id: people.id, name: people.name, role: people.role }).from(people);
  return Response.json({ people: rows });
}
