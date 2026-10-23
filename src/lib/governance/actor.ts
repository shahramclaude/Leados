// Minimal actor resolution for API routes. This repo has no authentication
// layer of its own yet, so for this part the "current user" is resolved
// from the `x-gov-user-id` request header, cross-checked against the
// gov_users table for its board tier. This keeps every access-control
// decision tier-driven and testable without inventing a session system
// that would duplicate work from other parts of LEADOS.

import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export type Actor = {
  id: number;
  name: string;
  email: string;
  boardTier: string;
};

export async function resolveActor(request: Request): Promise<Actor | null> {
  const idHeader = request.headers.get("x-gov-user-id");
  if (!idHeader) return null;
  const id = Number(idHeader);
  if (!Number.isFinite(id)) return null;
  const [row] = await db.select().from(users).where(eq(users.id, id));
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, boardTier: row.boardTier };
}

export function unauthorized() {
  return Response.json({ ok: false, error: "Unauthorized: missing or unknown x-gov-user-id" }, { status: 401 });
}

export function forbidden(message: string) {
  return Response.json({ ok: false, error: message }, { status: 403 });
}
