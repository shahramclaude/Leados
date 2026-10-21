import { recordCheckIn } from "@/lib/okr";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  const { keyResultId, currentValue, selfReportedStatus, selfReportedConfidence } = body;
  if (keyResultId == null || currentValue == null || !selfReportedStatus) {
    return Response.json({ error: "keyResultId, currentValue, and selfReportedStatus are required" }, { status: 400 });
  }
  const row = await recordCheckIn(keyResultId, currentValue, selfReportedStatus, selfReportedConfidence ?? 0.8);
  return Response.json({ keyResult: row });
}
