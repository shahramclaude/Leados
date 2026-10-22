// LEADOS Part 14 — GET /api/me
// Resolves (and lazily seeds) the current demo actor. Stand-in for real
// session/auth (Part 03). Accepts ?role=manager to switch demo persona.
import { resolveActor } from "@/lib/demoContext";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const actor = await resolveActor(req);
  return Response.json(actor);
}
