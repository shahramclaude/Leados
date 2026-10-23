import { db } from "@/db";
import { users } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(users);
  return Response.json({ ok: true, users: rows });
}
