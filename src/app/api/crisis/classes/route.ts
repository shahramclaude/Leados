import { db } from "@/db";
import { crisisClasses, personas } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const classes = await db.select().from(crisisClasses);
  const people = await db.select().from(personas);
  return Response.json({ classes, personas: people });
}
