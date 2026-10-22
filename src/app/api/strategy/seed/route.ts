import { NextRequest } from "next/server";
import { seedDemoData } from "@/lib/strategy/seedDb";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const count = typeof body.objectiveCount === "number" ? body.objectiveCount : 24;
  const result = await seedDemoData(count);
  return Response.json({ ok: true, ...result });
}
