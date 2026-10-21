// POST /api/me/view-as { userId } — dev-only identity switcher used by the
// demo "view as" control, since this part does not include real auth (see
// src/lib/currentUser.ts). Sets the `leados_uid` cookie the server-rendered
// Now surface and all API routes read.

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.userId) return Response.json({ error: "userId required" }, { status: 400 });

  const [row] = await db.select().from(users).where(eq(users.id, body.userId)).limit(1);
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  const res = Response.json({ ok: true, user: row });
  res.headers.set(
    "set-cookie",
    `leados_uid=${encodeURIComponent(row.id)}; Path=/; SameSite=Lax; Max-Age=31536000`,
  );
  return res;
}
