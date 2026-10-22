import { NextRequest } from "next/server";
import { ensureDecisionInvariants } from "@/lib/decision/dbSetup";
import {
  listDecisionRights,
  upsertDecisionRights,
  detectAmbiguousDecisionRights,
} from "@/lib/decision/decisionRights";

export const dynamic = "force-dynamic";

// GET /api/decisions/rights?orgId=... -> config + ambiguity findings
export async function GET(req: NextRequest) {
  await ensureDecisionInvariants();
  const orgId = req.nextUrl.searchParams.get("orgId");
  if (!orgId) return Response.json({ error: "orgId is required" }, { status: 400 });

  const [configs, findings] = await Promise.all([
    listDecisionRights(orgId),
    detectAmbiguousDecisionRights(orgId),
  ]);

  return Response.json({ configs, findings });
}

export async function POST(req: NextRequest) {
  await ensureDecisionInvariants();
  const body = await req.json();
  if (!body.orgId || !body.decisionClass) {
    return Response.json({ error: "orgId and decisionClass are required" }, { status: 400 });
  }

  const row = await upsertDecisionRights({
    orgId: body.orgId,
    decisionClass: body.decisionClass,
    deciderRole: body.deciderRole ?? null,
    consultedRoles: body.consultedRoles ?? [],
    informedRoles: body.informedRoles ?? [],
  });

  return Response.json({ config: row }, { status: 201 });
}
