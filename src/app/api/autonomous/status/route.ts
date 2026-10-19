// GET /api/autonomous/status — autonomy pause state + last run + budgets.
import { getRunHistory } from "@/lib/kernel/orchestrator";
import { getAutonomySettings } from "@/lib/kernel/killSwitch";
import { listTodayBudgets } from "@/lib/kernel/budget";

export const dynamic = "force-dynamic";

export async function GET() {
  const [settings, recentRuns, budgets] = await Promise.all([getAutonomySettings(), getRunHistory(5), listTodayBudgets()]);

  return Response.json({
    ok: true,
    autonomy: settings,
    lastRun: recentRuns[0] ?? null,
    recentRuns,
    budgets,
  });
}
