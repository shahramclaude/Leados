import { NextRequest } from "next/server";
import { ensureDecisionInvariants } from "@/lib/decision/dbSetup";
import { ingestSignalReading } from "@/lib/decision/triggers";

export const dynamic = "force-dynamic";

// POST /api/decisions/signals -> Part 13 (sensing) STUB SEAM. Manually ingest
// a signal reading until the real sensing pipeline exists. See
// src/lib/decision/triggers.ts for the documented seam.
export async function POST(req: NextRequest) {
  await ensureDecisionInvariants();
  const body = await req.json();
  if (!body.orgId || !body.signal || typeof body.value !== "number") {
    return Response.json({ error: "orgId, signal, value(number) are required" }, { status: 400 });
  }
  const row = await ingestSignalReading({ orgId: body.orgId, signal: body.signal, value: body.value });
  return Response.json({ reading: row }, { status: 201 });
}
