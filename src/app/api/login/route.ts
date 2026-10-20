import { listLoginChoices, verifyLoginChoice } from "@/lib/app/auth";
import { SESSION_ORG_COOKIE, SESSION_USER_COOKIE } from "@/lib/platform/session";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  const choices = await listLoginChoices();
  return Response.json({ choices });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { userId?: string; orgId?: string };
  if (!body.userId || !body.orgId) {
    return Response.json({ error: "userId and orgId are required" }, { status: 400 });
  }
  const valid = await verifyLoginChoice(body.userId, body.orgId);
  if (!valid) {
    return Response.json({ error: "No such membership" }, { status: 403 });
  }
  const store = await cookies();
  store.set(SESSION_USER_COOKIE, body.userId, { httpOnly: true, sameSite: "lax", path: "/" });
  store.set(SESSION_ORG_COOKIE, body.orgId, { httpOnly: true, sameSite: "lax", path: "/" });
  return Response.json({ ok: true });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(SESSION_USER_COOKIE);
  store.delete(SESSION_ORG_COOKIE);
  return Response.json({ ok: true });
}
