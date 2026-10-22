import { NextResponse } from "next/server";
import { db } from "@/db";
import { cadenceOverrides } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logCadenceOverride } from "@/lib/cadence/policyEngine";
import { resolveOrgId } from "@/lib/cadence/resolveOrg";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgId = await resolveOrgId(url.searchParams);
  const overrides = await db.select().from(cadenceOverrides).where(eq(cadenceOverrides.orgId, orgId));
  return NextResponse.json({ orgId, overrides });
}

interface OverrideBody {
  orgId?: string;
  ritualId: string;
  occurrenceId?: string | null;
  overrideType: "force_full" | "force_async" | "force_skip" | "reactivate_policy";
  reason: string;
  actorId?: string | null;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = (await request.json()) as OverrideBody;
  if (!body.ritualId || !body.overrideType || !body.reason) {
    return NextResponse.json({ error: "ritualId, overrideType, and reason are required" }, { status: 400 });
  }
  const orgId = body.orgId ?? (await resolveOrgId(url.searchParams));
  try {
    const row = await logCadenceOverride({ ...body, orgId });
    return NextResponse.json({ override: row }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
