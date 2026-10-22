import GlobalOpsNav from "@/components/GlobalOpsNav";
import MethodBadge from "@/components/MethodBadge";
import { loadGroupPageData } from "@/lib/global-ops/pageData";
import { formatMoney, formatPercent } from "@/lib/global-ops/format";
import { methodForStatement } from "@/lib/global-ops/fx";

export const dynamic = "force-dynamic";

const LOCALE = "en-US";

export default async function EntityComparePage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; fy?: string; fp?: string }>;
}) {
  const params = await searchParams;
  const groupId = Number.parseInt(params.group ?? "1", 10);
  const fiscalYear = Number.parseInt(params.fy ?? "2025", 10);
  const fiscalPeriod = Number.parseInt(params.fp ?? "1", 10);

  const { group, entities, result } = await loadGroupPageData(groupId, fiscalYear, fiscalPeriod);
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const plMethod = methodForStatement("PL");

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <GlobalOpsNav active="/entity-compare" />
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.08em] text-slate-600">Part 37 · Global Operations</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Entity Compare — {group.name}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Every entity, side-by-side, in both its own local currency and the group reporting currency (
            {group.groupCurrency}). Net income translation uses the <MethodBadge method={plMethod} /> method
            consistently (P&amp;L standard). Entities are never hidden because they are small or loss-making.
          </p>
        </header>

        <section className="overflow-x-auto rounded-3xl bg-white p-6 shadow-[0_12px_40px_rgba(16,24,40,0.08)]">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Entity</th>
                <th className="py-2 pr-4">Jurisdiction</th>
                <th className="py-2 pr-4">Method</th>
                <th className="py-2 pr-4">Ownership</th>
                <th className="py-2 pr-4">Inclusion in group</th>
                <th className="py-2 pr-4">Net income (local)</th>
                <th className="py-2 pr-4">Net income ({group.groupCurrency})</th>
              </tr>
            </thead>
            <tbody>
              {result.entitySummaries.map((s) => {
                const entity = entityById.get(s.entityId);
                const isLoss = s.standaloneNetIncomeLocal < 0;
                return (
                  <tr key={s.entityId} className="border-t border-slate-100">
                    <td className="py-2.5 pr-4">
                      <p className="font-medium text-slate-900">{s.entityCode}</p>
                      <p className="text-xs text-slate-500">{s.legalName}</p>
                    </td>
                    <td className="py-2.5 pr-4">{entity?.jurisdictionCode}</td>
                    <td className="py-2.5 pr-4 capitalize">{s.consolidationMethod}</td>
                    <td className="py-2.5 pr-4">{formatPercent(s.ownershipPct, LOCALE)}</td>
                    <td className="py-2.5 pr-4">{formatPercent(s.inclusionPct, LOCALE)}</td>
                    <td className={`py-2.5 pr-4 font-medium ${isLoss ? "text-red-600" : "text-slate-900"}`}>
                      {formatMoney({ value: s.standaloneNetIncomeLocal, currency: s.functionalCurrency }, entity?.localeTag ?? LOCALE)}
                    </td>
                    <td className={`py-2.5 pr-4 font-semibold ${isLoss ? "text-red-600" : "text-slate-950"}`}>
                      {formatMoney({ value: s.standaloneNetIncomeGroupCcy, currency: group.groupCurrency }, LOCALE)}{" "}
                      {s.functionalCurrency !== group.groupCurrency && <MethodBadge method={plMethod} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <p className="mt-6 text-xs text-slate-500">
          Note: standalone net income figures above are each entity&apos;s own result after its own intercompany
          eliminations, before any ownership-based inclusion or NCI carve-out — see Group Consolidation for the
          rolled-up view.
        </p>
      </div>
    </main>
  );
}
