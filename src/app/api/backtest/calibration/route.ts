import { getCalibrationReport } from "@/lib/worldModel";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await getCalibrationReport();
  return Response.json(report);
}
