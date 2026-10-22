import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_ORG_COOKIE, SESSION_USER_COOKIE } from "@/lib/org-context";

export const dynamic = "force-dynamic";

// DEV ONLY tenant/role switcher — stands in for real sign-in so this part
// can demonstrate RBAC + tenancy without Parts 01-03's auth stack.
export async function POST(request: Request) {
  const body = (await request.json()) as { orgId?: string; userId?: string };
  if (!body.orgId || !body.userId) {
    return NextResponse.json({ error: "orgId and userId are required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_ORG_COOKIE, body.orgId, { path: "/", httpOnly: false, sameSite: "lax" });
  cookieStore.set(SESSION_USER_COOKIE, body.userId, { path: "/", httpOnly: false, sameSite: "lax" });

  return NextResponse.json({ ok: true });
}
