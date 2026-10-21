import { NextRequest } from "next/server";
import { db } from "@/db";
import { people, actors, teams } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveActor } from "@/lib/requestActor";
import { toErrorResponse } from "@/lib/apiError";
import { isHr, isExecutive } from "@/lib/accessControl";

export const dynamic = "force-dynamic";

/**
 * Roster listing, scoped at the repository layer:
 *  - HR/executive: full roster.
 *  - Manager: direct reports only.
 *  - Employee: self only.
 */
export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActor(req);

    const rows = await db
      .select({
        id: actors.id,
        name: actors.name,
        email: actors.email,
        role: people.role,
        title: people.title,
        teamId: people.teamId,
        teamName: teams.name,
        managerId: people.managerId,
        status: people.status,
      })
      .from(people)
      .innerJoin(actors, eq(actors.id, people.id))
      .leftJoin(teams, eq(teams.id, people.teamId));

    let scoped = rows;
    if (isHr(actor) || isExecutive(actor)) {
      scoped = rows;
    } else if (actor.globalRole === "manager") {
      scoped = rows.filter((r) => r.managerId === actor.id || r.id === actor.id);
    } else {
      scoped = rows.filter((r) => r.id === actor.id);
    }

    return Response.json({ actor: { id: actor.id, role: actor.globalRole }, people: scoped });
  } catch (err) {
    return toErrorResponse(err);
  }
}
