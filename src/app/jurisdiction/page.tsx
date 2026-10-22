import Link from "next/link";
import GlobalOpsNav from "@/components/GlobalOpsNav";
import {
  listAllEntities,
  listObligationDefinitions,
  listObligationInstancesForGroupWithResidency,
} from "@/lib/global-ops/repository";
import { applicableObligations } from "@/lib/global-ops/obligations";
import { formatDate } from "@/lib/global-ops/format";
import { nextBusinessDay } from "@/lib/global-ops/holidays";

export const dynamic = "force-dynamic";

const REGIONS = ["us", "eu", "uk", "apac"];

const STATUS_COLOR: Record<string, string> = {
  filed: "bg-emerald-100 text-emerald-800",
  in_progress: "bg-blue-100 text-blue-800",
  not_started: "bg-slate-100 text-slate-600",
  overdue: "bg-red-100 text-red-800",
  waived: "bg-purple-100 text-purple-800",
};

export default async function JurisdictionPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; region?: string }>;
}) {
  const params = await searchParams;
  const groupId = Number.parseInt(params.group ?? "1", 10);
  const requestingRegion = params.region ?? "us";

  const [entities, obligationDefs, residencyResult] = await Promise.all([
    listAllEntities(),
    listObligationDefinitions(),
    listObligationInstancesForGroupWithResidency(groupId, requestingRegion),
  ]);
  const groupEntities = entities.filter((e) => e.groupId === groupId);
  const entityById = new Map(groupEntities.map((e) => [e.id, e]));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <GlobalOpsNav active="/jurisdiction" />
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.08em] text-slate-600">Part 37 · Global Operations</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Jurisdiction View</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Obligations are scoped per jurisdiction and applicability rule (ownership %, region, consolidation
            method). Data residency is enforced at the repository layer — switch the requesting region below to see
            a live cross-border read attempt get blocked rather than silently filtered.
          </p>
        </header>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-700">Reading as region:</span>
          {REGIONS.map((r) => (
            <Link
              key={r}
              href={`/jurisdiction?group=${groupId}&region=${r}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                requestingRegion === r ? "bg-slate-950 text-white" : "bg-white text-slate-700 shadow-sm hover:bg-slate-100"
              }`}
            >
              {r}
            </Link>
          ))}
        </div>

        <section className="mb-8 rounded-3xl bg-white p-6 shadow-[0_12px_40px_rgba(16,24,40,0.08)]">
          <h2 className="mb-4 text-lg font-semibold text-slate-950">Obligations &amp; data residency — region: {requestingRegion}</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="py-1 pr-3">Entity</th>
                <th className="py-1 pr-3">Obligation</th>
                <th className="py-1 pr-3">Period</th>
                <th className="py-1 pr-3">Due date</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1 pr-3">Cadence-adjusted next business day</th>
              </tr>
            </thead>
            <tbody>
              {residencyResult.allowed.map((row) => {
                const entity = entityById.get(row.entityId);
                const dueYear = Number.parseInt(row.dueDate.slice(0, 4), 10);
                const adjusted = entity ? nextBusinessDay(row.dueDate, entity.region, dueYear) : row.dueDate;
                return (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 font-medium">{entity?.code ?? row.entityId}</td>
                    <td className="py-1.5 pr-3">{row.obligationTitle} <span className="text-xs text-slate-400">({row.obligationCode})</span></td>
                    <td className="py-1.5 pr-3">{row.periodLabel}</td>
                    <td className="py-1.5 pr-3">{formatDate(row.dueDate, entity?.localeTag ?? "en-US")}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[row.status] ?? ""}`}>{row.status.replace("_", " ")}</span>
                      {row.status === "overdue" && today > row.dueDate && <span className="ml-2 text-xs text-red-600">● past due</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-xs text-slate-500">{formatDate(adjusted, entity?.localeTag ?? "en-US")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {residencyResult.blocked.length > 0 && (
            <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">🔒 {residencyResult.blocked.length} record(s) withheld by data residency policy for region &quot;{requestingRegion}&quot;</p>
              <ul className="mt-2 list-disc pl-5 text-xs">
                {residencyResult.blocked.map((b, i) => (
                  <li key={i}>
                    Obligation instance #{b.row.id} (data class &quot;{b.dataClass}&quot;): {b.reason}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs">Nothing is silently dropped — this list is the proof that enforcement happened.</p>
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-[0_12px_40px_rgba(16,24,40,0.08)]">
          <h2 className="mb-4 text-lg font-semibold text-slate-950">Applicability by entity</h2>
          <div className="space-y-4">
            {groupEntities.map((entity) => {
              const applicable = applicableObligations(obligationDefs, entity);
              return (
                <div key={entity.id} className="rounded-xl border border-slate-200 p-4">
                  <p className="font-medium text-slate-900">
                    {entity.legalName} <span className="text-xs text-slate-400">({entity.code}, jurisdiction {entity.jurisdictionCode}, region {entity.region})</span>
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {applicable.map((o) => (
                      <li key={o.code} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                        {o.title}
                      </li>
                    ))}
                    {applicable.length === 0 && <li className="text-xs text-slate-400">No obligations matched.</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
