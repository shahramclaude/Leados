import { runOnboarding } from "@/lib/app/onboarding";
import { needsFirstRunOnboarding } from "@/lib/app/auth";
import { SESSION_ORG_COOKIE, SESSION_USER_COOKIE } from "@/lib/platform/session";
import type { OrgProfile } from "@/lib/domain/types";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  const needsOnboarding = await needsFirstRunOnboarding();
  return Response.json({ needsOnboarding });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as OrgProfile;
    const result = await runOnboarding(body);

    const store = await cookies();
    store.set(SESSION_USER_COOKIE, result.userId, { httpOnly: true, sameSite: "lax", path: "/" });
    store.set(SESSION_ORG_COOKIE, result.orgId, { httpOnly: true, sameSite: "lax", path: "/" });

    return Response.json({ orgId: result.orgId, userId: result.userId }, { status: 201 });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
