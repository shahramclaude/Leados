// Lists every seeded (org, user, role) combination so the demo identity
// switcher in the top nav can offer a realistic set of personas without a
// real login flow. See docs/RED-TEAM-2026.md SEC-1.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, orgs, users } from "@/db/schema";
import { ok, withApiResult } from "@/lib/api-result";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApiResult(async () => {
    const rows = await db
      .select({
        orgId: orgs.id,
        orgName: orgs.name,
        userId: users.id,
        userEmail: users.email,
        userName: users.name,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(orgs, eq(orgs.id, memberships.orgId))
      .innerJoin(users, eq(users.id, memberships.userId));

    return ok(rows);
  });
}
