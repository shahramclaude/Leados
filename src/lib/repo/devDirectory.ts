import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, orgs, users } from "@/db/schema";

/**
 * INTENTIONAL EXCEPTION to "no unscoped tenant queries": this is the one
 * function in the codebase that reads across every org, and it exists only
 * to populate the dev-only tenant/role switcher in the app chrome (there is
 * no real sign-in in this sandbox — see AI-SESSION-LOG.md). It returns no
 * tenant *data*, only directory metadata (org name/id, role, user id) needed
 * to let a reviewer switch sessions. No other module may import this.
 */
export async function listAllDemoUsers() {
  return db
    .select({
      orgId: orgs.id,
      orgSlug: orgs.slug,
      orgName: orgs.name,
      role: memberships.role,
      userId: users.id,
    })
    .from(memberships)
    .innerJoin(orgs, eq(orgs.id, memberships.orgId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .orderBy(orgs.slug, memberships.role);
}
