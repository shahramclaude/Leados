import { NextRequest, NextResponse } from "next/server";
import { getUserInOrg } from "@/db/repositories/orgs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encodeSession, SESSION_COOKIE_NAME } from "@/lib/session";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { userId } = body as { userId?: string };
  if (!userId) {
    return NextResponse.json({ error: "validation", message: "userId is required." }, { status: 400 });
  }
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) {
    return NextResponse.json({ error: "not_found", message: "Unknown demo account." }, { status: 404 });
  }
  // Re-confirm via the org-scoped lookup so the login path exercises the
  // same chokepoint as every other org-scoped read.
  const scoped = await getUserInOrg(user.orgId, user.id);
  if (!scoped) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const token = encodeSession({ userId: scoped.id, orgId: scoped.orgId });
  const response = NextResponse.json({ ok: true, user: { id: scoped.id, name: scoped.name, role: scoped.role } });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
