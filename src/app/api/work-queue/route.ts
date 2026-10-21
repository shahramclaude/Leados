// GET /api/work-queue — role-scoped work queue listing (Part 09 scoping
// reused: a user only sees items in domains their role may see).

import { db } from "@/db";
import { workQueueItems } from "@/db/schema";
import { resolveCurrentUser } from "@/lib/currentUser";
import { visibleDomainsForRole } from "@/lib/scoping";
import { asc, inArray, ne } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await resolveCurrentUser(req);
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });

  const domains = await visibleDomainsForRole(user.role);
  const domainList = [...domains];
  if (domainList.length === 0) return Response.json({ items: [] });

  const rows = await db
    .select()
    .from(workQueueItems)
    .where(domainList.includes("*") ? ne(workQueueItems.status, "__never__") : inArray(workQueueItems.domain, domainList))
    .orderBy(asc(workQueueItems.priority), asc(workQueueItems.createdAt));

  return Response.json({ items: rows });
}
