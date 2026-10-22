import { NextResponse } from "next/server";
import { db } from "@/db";
import { cadencePolicies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { resolveOrgId } from "@/lib/cadence/resolveOrg";
import type { CadenceRule } from "@/lib/cadence/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgId = await resolveOrgId(url.searchParams);
  const policies = await db.select().from(cadencePolicies).where(eq(cadencePolicies.orgId, orgId));
  return NextResponse.json({ orgId, policies });
}

interface CreatePolicyBody {
  orgId?: string;
  ritualId: string;
  name: string;
  description: string;
  rule: CadenceRule;
  createdBy?: string;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = (await request.json()) as CreatePolicyBody;
  if (!body.ritualId || !body.name || !body.description || !body.rule) {
    return NextResponse.json({ error: "ritualId, name, description, and rule are required" }, { status: 400 });
  }
  const orgId = body.orgId ?? (await resolveOrgId(url.searchParams));
  const [policy] = await db
    .insert(cadencePolicies)
    .values({
      orgId,
      ritualId: body.ritualId,
      name: body.name,
      description: body.description,
      rule: body.rule,
      createdBy: body.createdBy ?? null,
    })
    .returning();
  return NextResponse.json({ policy }, { status: 201 });
}
