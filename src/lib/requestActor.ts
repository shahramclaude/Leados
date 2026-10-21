// Demo authentication seam: resolves the calling actor from the
// `x-actor-id` header against the `actors` table. A real deployment would
// replace this with session/SSO-based auth; every downstream repository
// function (accessControl.ts) enforces authorization independent of how the
// actor was resolved, so swapping this out is safe.

import { db } from "@/db";
import { actors } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Actor, GlobalRole } from "./accessControl";
import { NextRequest } from "next/server";

export class UnauthenticatedError extends Error {}

export async function resolveActor(req: NextRequest): Promise<Actor> {
  const actorId = req.headers.get("x-actor-id");
  if (!actorId) throw new UnauthenticatedError("Missing x-actor-id header");
  const [row] = await db.select().from(actors).where(eq(actors.id, actorId)).limit(1);
  if (!row) throw new UnauthenticatedError(`Unknown actor ${actorId}`);
  return { id: row.id, globalRole: row.globalRole as GlobalRole };
}
