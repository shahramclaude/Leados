import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { secureRoute, jsonError } from "@/lib/apiUtils";

// Returns only the caller's own identity — never trusts or echoes any
// client-supplied identity claim (userId/orgId/role always come from the
// server-verified session, see src/lib/session.ts).
export const GET = secureRoute({
  method: "GET",
  path: "/api/auth/session",
  handler: async ({ session }) => {
    if (!session) return jsonError(401, "Authentication required");
    const [user] = await db
      .select({ email: users.email, mustChangePassword: users.mustChangePassword })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    return NextResponse.json({
      userId: session.userId,
      orgId: session.orgId,
      role: session.role,
      email: user?.email,
      mustChangePassword: user?.mustChangePassword ?? false,
    });
  },
});
