import { API_REGISTRY } from "@/lib/registry";

export const dynamic = "force-dynamic";

// Self-describing: the registry that gates the public API (Part 19/16) is
// itself readable through an internal admin route, so "what is reachable
// from outside" is never a question that requires reading source code.
export async function GET() {
  return Response.json({ ok: true, registry: API_REGISTRY });
}
