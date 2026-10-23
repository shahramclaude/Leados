import { getOrCreateDemoTenant } from "@/lib/tenant";
import { appendDecision, listDecisions } from "@/lib/ledger";

export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await getOrCreateDemoTenant();
  const rows = await listDecisions(tenant.id);
  return Response.json({ decisions: rows.slice().reverse() });
}

export async function POST(request: Request) {
  const tenant = await getOrCreateDemoTenant();
  const body = await request.json().catch(() => null);

  if (
    !body ||
    typeof body.entityType !== "string" ||
    typeof body.entityId !== "string" ||
    typeof body.action !== "string" ||
    typeof body.rationale !== "string"
  ) {
    return Response.json(
      { error: "entityType, entityId, action and rationale are required" },
      { status: 400 },
    );
  }

  const row = await appendDecision({
    tenantId: tenant.id,
    entityType: body.entityType,
    entityId: body.entityId,
    action: body.action,
    payload: body.payload ?? {},
    rationale: body.rationale,
  });

  return Response.json({ decision: row }, { status: 201 });
}
