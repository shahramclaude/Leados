import GlobalOpsNav from "@/components/GlobalOpsNav";
import MethodBadge from "@/components/MethodBadge";
import { listEliminations } from "@/lib/global-ops/repository";
import { loadGroupPageData } from "@/lib/global-ops/pageData";
import { formatDate, formatMoney, formatPercent, rateProvenanceLabel } from "@/lib/global-ops/format";
import type { StatementType } from "@/lib/global-ops/types";

export const dynamic = "force-dynamic";

const STATEMENT_LABEL: Record<StatementType, string> = { PL: "Profit & Loss", BS: "Balance Sheet", EQ: "Equity" };

function LocaleTag() {
  return "en-US";
}

export default async function GroupConsolidationPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; fy?: string; fp?: string }>;
}) {
  const params = await searchParams;
  const groupId = Number.parseInt(params.group ?? "1", 10);
  const fiscalYear = Number.parseInt(params.fy ?? "2025", 10);
  const fiscalPeriod = Number.parseInt(params.fp ?? "1", 10);

  const data = await loadGroupPageData(groupId, fiscalYear, fiscalPeriod);
  const { group, result, entities } = data;
  const locale = LocaleTag();
  const eliminations = await listEliminations(groupId, fiscalYear, fiscalPeriod);

  const entityById = new Map(entities.map((e) => [e.id, e]));
  const weakEntities = result.entitySummaries.filter((s) => s.standaloneNetIncomeLocal < 0);

  const byStatement: Record<StatementType, typeof result.lines> = { PL: [], BS: [], EQ: [] };
  for (const line of result.lines) byStatement[line.statement].push(line);

  const totalMinorityInterest = result.minorityInterest.reduce((s, m) => s + m.nciAmountGroupCcy, 0);

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <GlobalOpsNav active="/group-consolidation" />
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.08em] text-slate-600">Part 37 · Global Operations</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Group Consolidation — {group.name}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            All figures in <strong>{group.groupCurrency}</strong> for FY{fiscalYear} · Period {fiscalPeriod}. Every
            consolidated total below is shown with its full entity-level drill-down — there is no number here that
            cannot be traced back to the entities that produced it.
          </p>
        </header>

        {weakEntities.length > 0 && (
          <div className="mb-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
            <p className="font-semibold">⚠ {weakEntities.length} entity(ies) posted a standalone net loss this period</p>
            <ul className="mt-2 list-disc pl-5">
              {weakEntities.map((w) => (
                <li key={w.entityId}>
                  <strong>{w.entityCode}</strong> ({entityById.get(w.entityId)?.legalName}): loss of{" "}
                  {formatMoney({ value: Math.abs(w.standaloneNetIncomeLocal), currency: w.functionalCurrency }, locale)} standalone —
                  see Board Pack for full note. This weakness is never netted away by the healthy group total below.
                </li>
              ))}
            </ul>
          </div>
        )}

        {(["PL", "BS", "EQ"] as StatementType[]).map((statement) => (
          <section key={statement} className="mb-8 rounded-3xl bg-white p-6 shadow-[0_12px_40px_rgba(16,24,40,0.08)]">
            <h2 className="mb-4 text-lg font-semibold text-slate-950">{STATEMENT_LABEL[statement]}</h2>
            {byStatement[statement].length === 0 ? (
              <p className="text-sm text-slate-500">No lines booked for this statement in this period.</p>
            ) : (
              <div className="space-y-4">
                {byStatement[statement].map((line) => (
                  <details key={`${line.statement}-${line.accountCode}`} className="rounded-xl border border-slate-200 p-4">
                    <summary className="flex cursor-pointer items-center justify-between gap-4">
                      <span className="font-medium text-slate-900">{line.accountLabel} <span className="text-xs text-slate-400">({line.accountCode})</span></span>
                      <span className="flex items-center gap-3">
                        {line.eliminationsAppliedGroupCcy !== 0 && (
                          <span className="text-xs text-amber-700">
                            elim {formatMoney({ value: line.eliminationsAppliedGroupCcy, currency: group.groupCurrency }, locale)}
                          </span>
                        )}
                        <span className="text-lg font-semibold text-slate-950">
                          {formatMoney({ value: line.consolidatedValue, currency: line.groupCurrency }, locale)}
                        </span>
                      </span>
                    </summary>
                    <table className="mt-4 w-full text-left text-sm">
                      <thead>
                        <tr className="text-xs uppercase text-slate-500">
                          <th className="py-1 pr-3">Entity</th>
                          <th className="py-1 pr-3">Local value</th>
                          <th className="py-1 pr-3">Elim.</th>
                          <th className="py-1 pr-3">Inclusion</th>
                          <th className="py-1 pr-3">Method</th>
                          <th className="py-1 pr-3">Translated ({group.groupCurrency})</th>
                          <th className="py-1 pr-3">Rate provenance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {line.contributions.map((c) => (
                          <tr key={c.entityId} className="border-t border-slate-100">
                            <td className="py-1.5 pr-3 font-medium text-slate-800">{c.entityCode}</td>
                            <td className="py-1.5 pr-3">{formatMoney({ value: c.grossLocalValue, currency: c.localCurrency }, locale)}</td>
                            <td className="py-1.5 pr-3">
                              {c.eliminationLocal !== 0 ? formatMoney({ value: c.eliminationLocal, currency: c.localCurrency }, locale) : "—"}
                            </td>
                            <td className="py-1.5 pr-3">{formatPercent(c.inclusionPct, locale)}</td>
                            <td className="py-1.5 pr-3"><MethodBadge method={c.method} /></td>
                            <td className="py-1.5 pr-3 font-semibold">{formatMoney({ value: c.translatedValue, currency: group.groupCurrency }, locale)}</td>
                            <td className="py-1.5 pr-3 text-xs text-slate-500">{rateProvenanceLabel(c.rateDate, c.rateSource, locale)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                ))}
              </div>
            )}
          </section>
        ))}

        <section className="mb-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-6 shadow-[0_12px_40px_rgba(16,24,40,0.08)]">
            <h2 className="mb-4 text-lg font-semibold text-slate-950">Non-controlling interest (full consolidation only)</h2>
            {result.minorityInterest.length === 0 ? (
              <p className="text-sm text-slate-500">No partially-owned, fully-consolidated subsidiaries this period.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {result.minorityInterest.map((m) => (
                  <li key={m.entityId} className="rounded-xl border border-slate-200 p-3">
                    <p className="font-medium text-slate-900">{m.entityCode} — {formatPercent(100 - m.ownershipPct, locale)} non-controlling</p>
                    <p className="text-slate-600">
                      Entity net income {formatMoney({ value: m.entityNetIncomeLocal, currency: m.entityNetIncomeCurrency }, locale)} ×{" "}
                      {formatPercent(100 - m.ownershipPct, locale)} ={" "}
                      <strong>{formatMoney({ value: m.nciAmountGroupCcy, currency: group.groupCurrency }, locale)}</strong>{" "}
                      <MethodBadge method={m.method} />
                    </p>
                  </li>
                ))}
                <li className="pt-2 text-sm font-semibold text-slate-900">
                  Total NCI: {formatMoney({ value: totalMinorityInterest, currency: group.groupCurrency }, locale)}
                </li>
              </ul>
            )}
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-[0_12px_40px_rgba(16,24,40,0.08)]">
            <h2 className="mb-4 text-lg font-semibold text-slate-950">Equity-method pickups</h2>
            {result.equityPickups.length === 0 ? (
              <p className="text-sm text-slate-500">No equity-method associates this period.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {result.equityPickups.map((p) => (
                  <li key={p.entityId} className="rounded-xl border border-slate-200 p-3">
                    <p className="font-medium text-slate-900">{p.entityCode} — {formatPercent(p.ownershipPct, locale)} owned</p>
                    <p className="text-slate-600">
                      Investee net income {formatMoney({ value: p.investeeNetIncomeLocal, currency: p.investeeNetIncomeCurrency }, locale)} ×{" "}
                      {formatPercent(p.ownershipPct, locale)} ={" "}
                      <strong>{formatMoney({ value: p.shareOfNetIncomeGroupCcy, currency: group.groupCurrency }, locale)}</strong>{" "}
                      <MethodBadge method={p.method} />
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Not consolidated line-by-line — this entity&apos;s own revenue/expense never enters group REV/EXP totals.
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-[0_12px_40px_rgba(16,24,40,0.08)]">
          <h2 className="mb-4 text-lg font-semibold text-slate-950">Intercompany eliminations (documented)</h2>
          {eliminations.length === 0 ? (
            <p className="text-sm text-slate-500">No eliminations booked this period.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-slate-500">
                  <th className="py-1 pr-3">From entity</th>
                  <th className="py-1 pr-3">Account</th>
                  <th className="py-1 pr-3">Amount</th>
                  <th className="py-1 pr-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {eliminations.map((e, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 font-medium">{entityById.get(e.fromEntityId)?.code ?? e.fromEntityId}</td>
                    <td className="py-1.5 pr-3">{e.accountCode}</td>
                    <td className="py-1.5 pr-3">{formatMoney({ value: e.amountValue, currency: e.amountCurrency }, locale)}</td>
                    <td className="py-1.5 pr-3 text-slate-600">{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-4 text-xs text-slate-400">Consolidation run at {formatDate(new Date().toISOString().slice(0, 10), locale)}.</p>
        </section>
      </div>
    </main>
  );
}
