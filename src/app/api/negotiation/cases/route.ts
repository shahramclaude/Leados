import { NextRequest } from "next/server";
import { negotiationCases } from "@/db/schema";
import { listRows, createRow, deleteRow, badRequest, ok } from "@/lib/leados/crud";
import { zopa } from "@/lib/leados/calc";
import { desc } from "drizzle-orm";

// Manipulation-pattern denylist: phrases the workbench refuses to store as
// negotiation "interests" because they describe deceptive or exploitative
// tactics rather than fair positioning.
const MANIPULATION_DENYLIST = [
  "lie about",
  "fake deadline",
  "blackmail",
  "threaten their family",
  "forge",
  "bribe",
  "exploit their desperation",
  "falsify",
];

function containsManipulation(text: string): string | null {
  const lower = text.toLowerCase();
  const hit = MANIPULATION_DENYLIST.find((p) => lower.includes(p));
  return hit ?? null;
}

function augment(row: Record<string, unknown>) {
  const theirRes = row.theirReservationEstimate === null || row.theirReservationEstimate === undefined ? null : Number(row.theirReservationEstimate);
  const hasBatnaEvidence = Boolean(row.batnaEvidence && String(row.batnaEvidence).trim().length > 0);
  const z = hasBatnaEvidence ? zopa(Number(row.ourReservation), theirRes, true) : null;
  return {
    ...row,
    batnaStatus: hasBatnaEvidence ? "evidenced" : "unknown",
    zopa: z ? { low: z[0], high: z[1] } : hasBatnaEvidence ? "no-deal-zone" : "unknown",
  };
}

export async function GET() {
  const rows = await listRows(negotiationCases, desc(negotiationCases.id));
  return ok(rows.map(augment));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.title || !body.counterpartyName) return badRequest("title and counterpartyName are required");

  const combined = `${body.ourInterests ?? ""} ${body.theirInterests ?? ""}`;
  const hit = containsManipulation(combined);
  if (hit) {
    return badRequest(`Blocked: interests contain a manipulation-pattern phrase ("${hit}"). This workbench supports fair, evidence-based negotiation only.`);
  }

  const row = await createRow(negotiationCases, {
    title: body.title,
    counterpartyName: body.counterpartyName,
    ourInterests: body.ourInterests || "",
    theirInterests: body.theirInterests || "",
    ourReservation: String(body.ourReservation ?? 0),
    ourTarget: String(body.ourTarget ?? 0),
    theirReservationEstimate: body.theirReservationEstimate ? String(body.theirReservationEstimate) : null,
    batnaEvidence: body.batnaEvidence || "",
    currency: body.currency || "USD",
    deadline: body.deadline || null,
  });
  return ok(augment(row), 201);
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return badRequest("id required");
  await deleteRow(negotiationCases, negotiationCases.id, id);
  return ok({ ok: true });
}
