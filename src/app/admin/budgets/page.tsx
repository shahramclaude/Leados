import { getSessionContext } from "@/lib/demo-auth";
import { listBudgets } from "@/services/budgets";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const session = await getSessionContext();
  if (!session) {
    return <p className="text-sm text-slate-600">Pick a demo identity first.</p>;
  }

  const rows = await listBudgets(session);

  return (
    <main className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold text-slate-950">Compute budgets</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every agent run charges this ledger before it is allowed to execute (Part 16 covering
          Part 06 compute). A run that would exceed the limit is rejected, not throttled silently.
        </p>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((b) => {
          const pct = Math.min(100, Math.round((b.computeUnitsUsed / b.computeUnitsLimit) * 100));
          return (
            <div key={b.id} className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">{b.period}</p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full ${pct >= 100 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {b.computeUnitsUsed} / {b.computeUnitsLimit} compute units used ({pct}%)
              </p>
            </div>
          );
        })}
      </div>
    </main>
  );
}
