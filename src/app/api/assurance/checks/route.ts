import { db } from "@/db";
import { assuranceChecks } from "@/db/schema";
import { fullBootstrap } from "@/lib/assurance/sync";
import { runSelfTest } from "@/lib/selfTest";

export const dynamic = "force-dynamic";

export async function GET() {
  await fullBootstrap();
  const checks = await db.select().from(assuranceChecks).orderBy(assuranceChecks.domain, assuranceChecks.id);
  return Response.json({ checks });
}

export async function POST() {
  // "Run now" dry self-test across the whole registry (no scheduler bookkeeping,
  // no remediation side effects) — used by the console's manual trigger.
  await fullBootstrap();
  const results = await runSelfTest();
  return Response.json({ results });
}
