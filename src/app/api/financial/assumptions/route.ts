import { listActiveAssumptions, reviseAssumption } from "@/lib/assumptions";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await listActiveAssumptions();
  return Response.json({ assumptions: rows });
}

export async function POST(req: Request) {
  const body = await req.json();
  const required = ["key", "label", "category", "owner", "rationale", "unit", "low", "base", "high", "effectiveDate"];
  for (const field of required) {
    if (body[field] === undefined) return Response.json({ error: `Missing field: ${field}` }, { status: 400 });
  }
  const row = await reviseAssumption(body);
  return Response.json({ assumption: row }, { status: 201 });
}
