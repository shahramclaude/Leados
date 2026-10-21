import { costReport } from "@/lib/modelCallLogger";
import { getOrgBudgetStatus } from "@/lib/costBudget";

export const dynamic = "force-dynamic";

export async function GET() {
  const [rows, budget] = await Promise.all([costReport(), getOrgBudgetStatus()]);
  return Response.json({ ok: true, rows, budget });
}
