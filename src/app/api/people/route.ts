import { db } from "@/db";
import { people } from "@/db/schema";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.select().from(people).orderBy(people.name);
    return Response.json({ people: rows });
  } catch {
    return Response.json({ error: "Failed to load people", errorId: randomUUID() }, { status: 500 });
  }
}
