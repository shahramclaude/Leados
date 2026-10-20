import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/apiUtils";

export const dynamic = "force-dynamic";

/**
 * Deliberately public: it never reveals anything beyond "who, if anyone, is
 * currently signed in on this browser", which the browser already knows via
 * its own cookie jar. This lets the frontend bootstrap auth UI state without
 * a dedicated "am I logged in" throw-away 401.
 */
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: { id: session.sub, email: session.email, role: session.role, orgId: session.orgId },
  });
}
