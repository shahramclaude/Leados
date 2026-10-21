// GET /api/me — resolves current dev-auth identity, and lists all seeded
// users so the demo UI can offer a "view as" switcher (there is no real
// login flow in this part; see src/lib/currentUser.ts).

import { db } from "@/db";
import { users } from "@/db/schema";
import { resolveCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await resolveCurrentUser(req);
  const all = await db.select().from(users);
  return Response.json({ user, users: all });
}
