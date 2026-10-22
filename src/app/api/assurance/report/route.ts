import { generateNightlyReport, getLatestReport } from "@/lib/assurance/report";
import { dailyCycleKey } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const reportDate = searchParams.get("date") ?? undefined;
  const report = await getLatestReport(reportDate);
  return Response.json({ report });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const reportDate: string = body.reportDate ?? dailyCycleKey();
  try {
    const report = await generateNightlyReport(reportDate);
    return Response.json({ report });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
