// Public / stakeholder-facing single source of truth. No auth — this is the
// page everyone shares. Returns the latest status for every non-closed
// crisis, each with its full (append-only, auto-versioned) update history.

import { db } from "@/db";
import { crises, crisisClasses, statusPageUpdates } from "@/db/schema";
import { desc, ne, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const activeCrises = await db
    .select({ crisis: crises, klass: crisisClasses })
    .from(crises)
    .innerJoin(crisisClasses, eq(crises.classId, crisisClasses.id))
    .where(ne(crises.state, "closed"))
    .orderBy(desc(crises.updatedAt));

  const result = [];
  for (const row of activeCrises) {
    const updates = await db
      .select()
      .from(statusPageUpdates)
      .where(eq(statusPageUpdates.crisisId, row.crisis.id))
      .orderBy(desc(statusPageUpdates.version));
    result.push({ crisis: row.crisis, klass: row.klass, updates });
  }

  return Response.json({ crises: result });
}
