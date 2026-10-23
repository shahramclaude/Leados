// Returns the demo org + directory (names/roles/emails — organizational
// directory info, not individual time-activity data, so no privacy gate
// applies here). Used by the UI to let a demo user pick "view as X".
import { db } from "@/db";
import { orgs, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const [org] = await db.select().from(orgs).limit(1);
  if (!org) {
    return Response.json({ org: null, users: [] });
  }
  const orgUsers = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, timezone: users.timezone, chronotype: users.chronotype })
    .from(users)
    .where(eq(users.orgId, org.id));
  return Response.json({ org, users: orgUsers });
}
