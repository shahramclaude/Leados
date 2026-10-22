import { loadFinanceLedger, loadSpendActivities } from "@/lib/esgData";
import { reconcileActivityToFinance } from "@/lib/costModel";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [ledger, spendActs] = await Promise.all([loadFinanceLedger(), loadSpendActivities()]);
    const rows = reconcileActivityToFinance(spendActs, ledger, 0.01);
    const allPass = rows.every((r) => r.pass);
    return Response.json({ ok: true, allPass, rows });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}
