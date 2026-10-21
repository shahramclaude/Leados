import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { getSessionContext, DEMO_USER_COOKIE, DEMO_ORG_COOKIE } from "@/lib/demo-auth";
import { ok, fail, withApiResult, ValidationError } from "@/lib/api-result";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiResult(async () => {
    const session = await getSessionContext();
    return ok(session);
  });
}

const switchSchema = z.object({ userId: z.string().uuid(), orgId: z.string().uuid() });

export async function POST(request: NextRequest) {
  return withApiResult(async () => {
    const json = await request.json().catch(() => null);
    const parsed = switchSchema.safeParse(json);
    if (!parsed.success) throw new ValidationError("userId and orgId are required");

    const store = await cookies();
    store.set(DEMO_USER_COOKIE, parsed.data.userId, { httpOnly: true, sameSite: "lax", path: "/" });
    store.set(DEMO_ORG_COOKIE, parsed.data.orgId, { httpOnly: true, sameSite: "lax", path: "/" });

    return ok({ switched: true });
  });
}
