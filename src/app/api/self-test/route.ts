import { db } from "@/db";
import { runSelfTests } from "@/lib/selfTest";
import { withErrorHandling, jsonOk, requireInternalAuth } from "@/lib/api";

export const dynamic = "force-dynamic";

async function handle(req: Request, requestId: string): Promise<Response> {
  requireInternalAuth(req);
  const report = await runSelfTests(db);
  return jsonOk(report, requestId);
}

export const GET = withErrorHandling("self-test", handle);
export const POST = withErrorHandling("self-test", handle);
