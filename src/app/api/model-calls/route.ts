import { recentModelCalls } from "@/lib/modelCallLogger";
import { getOrgBudgetStatus } from "@/lib/costBudget";

export const dynamic = "force-dynamic";

export async function GET() {
  const [calls, budget] = await Promise.all([recentModelCalls(50), getOrgBudgetStatus()]);
  return Response.json({ ok: true, calls, budget });
}
