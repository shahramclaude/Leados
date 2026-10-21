import { runSelfTest } from "@/lib/self-test";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await runSelfTest();
  return Response.json(report, { status: report.pass ? 200 : 503 });
}
