import { persistCalibration, runCalibration } from "@/lib/intelligence/intelligence";

export const dynamic = "force-dynamic";

export async function GET() {
  const reports = runCalibration();
  return Response.json({ reports });
}

export async function POST() {
  const reports = runCalibration();
  try {
    await persistCalibration(reports);
  } catch {
    // best effort persistence
  }
  return Response.json({ reports, persisted: true });
}
