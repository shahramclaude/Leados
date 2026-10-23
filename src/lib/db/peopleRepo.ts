import { db } from "@/db";
import { people } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function listPeople() {
  return db.select().from(people);
}

export async function getPerson(id: string) {
  const rows = await db.select().from(people).where(eq(people.id, id));
  return rows[0] ?? null;
}

export async function findPersonByName(name: string) {
  const rows = await listPeople();
  return rows.find((p) => p.name.toLowerCase() === name.toLowerCase()) ?? null;
}
