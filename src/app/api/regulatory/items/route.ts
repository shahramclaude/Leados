import { NextRequest } from "next/server";
import { regulatoryItems } from "@/db/schema";
import { listRows, createRow, updateRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { regulatoryImpactScore, canMarkEnacted } from "@/lib/leados/calc";
import { desc } from "drizzle-orm";

function augment(row: Record<string, unknown>) {
  return {
    ...row,
    impactScore: regulatoryImpactScore({
      probability: Number(row.probability),
      impactUsd: Number(row.impactUsd),
      proximityDays: Number(row.proximityDays),
    }),
  };
}

export async function GET() {
  const rows = await listRows(regulatoryItems, desc(regulatoryItems.id));
  return ok(rows.map(augment));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.jurisdiction || !body.domain) return badRequest("jurisdiction and domain are required");
  const status = body.status || "proposed";
  if (status === "enacted" && !canMarkEnacted(body.evidenceClass)) {
    return badRequest("Only primary-source or official-summary evidence can mark an item 'enacted' — press alone is not enough.");
  }
  const row = await createRow(regulatoryItems, {
    jurisdiction: body.jurisdiction,
    domain: body.domain,
    status,
    evidenceClass: body.evidenceClass || "reputable-press",
    probability: String(body.probability ?? 0.5),
    impactUsd: String(body.impactUsd ?? 0),
    proximityDays: Number(body.proximityDays) || 365,
  });
  return ok(augment(row), 201);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const id = Number(body.id);
  if (!id) return badRequest("id required");
  if (body.status === "enacted" && !canMarkEnacted(body.evidenceClass)) {
    return badRequest("Only primary-source or official-summary evidence can mark an item 'enacted'.");
  }
  const row = await updateRow(regulatoryItems, regulatoryItems.id, id, {
    status: body.status,
    evidenceClass: body.evidenceClass,
  });
  return ok(augment(row));
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(regulatoryItems, regulatoryItems.id, id);
  return ok({ ok: true });
}
