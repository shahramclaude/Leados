import { db } from "@/db";
import { auditRuleAccuracy } from "@/lib/ruleEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  const reports = await auditRuleAccuracy(db, 90);
  return Response.json(reports);
}
