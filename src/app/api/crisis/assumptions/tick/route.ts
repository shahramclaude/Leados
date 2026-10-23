// SEAM: Part 10's kernel should own real recurring task scheduling. Until
// that merge, this endpoint performs the auto-reverification sweep and can be
// invoked by an external cron, by the kernel once integrated, or manually
// from the Crisis Room / a drill.

import { tickAssumptions } from "@/lib/crisis/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const result = await tickAssumptions(body.crisisId);
  return Response.json(result);
}
