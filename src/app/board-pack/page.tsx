import GlobalOpsNav from "@/components/GlobalOpsNav";
import { loadGroupPageData } from "@/lib/global-ops/pageData";
import { listBoardPackNotes } from "@/lib/global-ops/repository";
import { buildEntityNotesSection } from "@/lib/global-ops/boardPack";
import { netIncomeAttributableToOwners } from "@/lib/global-ops/consolidation";
import { formatMoney } from "@/lib/global-ops/format";

export const dynamic = "force-dynamic";

const LOCALE = "en-US";

const FLAG_STYLE: Record<string, string> = {
  info: "bg-slate-100 text-slate-700",
  watch: "bg-amber-100 text-amber-800",
  risk: "bg-red-100 text-red-800",
};

export default async function BoardPackPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; fy?: string; fp?: string }>;
}) {
  const params = await searchParams;
  const groupId = Number.parseInt(params.group ?? "1", 10);
  const fiscalYear = Number.parseInt(params.fy ?? "2025", 10);
  const fiscalPeriod = Number.parseInt(params.fp ?? "1", 10);

  const { group, entities, result } = await loadGroupPageData(groupId, fiscalYear, fiscalPeriod);
  const noteRows = await listBoardPackNotes(groupId, fiscalYear, fiscalPeriod);
  const notes = noteRows.map((n) => ({
    entityId: n.entityId,
    fiscalYear: n.fiscalYear,
    fiscalPeriod: n.fiscalPeriod,
    noteText: n.noteText,
    flagLevel: n.flagLevel as "info" | "watch" | "risk",
  }));
  const rows = buildEntityNotesSection(result, entities, notes);
  const ownersNetIncome = netIncomeAttributableToOwners(result);

  const revenue = result.lines.filter((l) => l.statement === "PL" && l.accountCode.startsWith("REV")).reduce((s, l) => s + l.consolidatedValue, 0);
  const expense = result.lines.filter((l) => l.statement === "PL" && l.accountCode.startsWith("EXP")).reduce((s, l) => s + l.consolidatedValue, 0);

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <GlobalOpsNav active="/board-pack" />
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.08em] text-slate-600">Part 37 · Global Operations</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Board Pack — {group.name}, FY{fiscalYear} P{fiscalPeriod}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Group headline numbers are always presented alongside the entity notes section below — a board reader
            can never see the consolidated total without also seeing which entity is driving it, well or badly.
          </p>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-[0_12px_40px_rgba(16,24,40,0.08)]">
            <p className="text-xs uppercase text-slate-500">Group revenue</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{formatMoney({ value: revenue, currency: group.groupCurrency }, LOCALE)}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-[0_12px_40px_rgba(16,24,40,0.08)]">
            <p className="text-xs uppercase text-slate-500">Group expense</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{formatMoney({ value: expense, currency: group.groupCurrency }, LOCALE)}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-[0_12px_40px_rgba(16,24,40,0.08)]">
            <p className="text-xs uppercase text-slate-500">Net income attributable to owners</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{formatMoney({ value: ownersNetIncome, currency: group.groupCurrency }, LOCALE)}</p>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-[0_12px_40px_rgba(16,24,40,0.08)]">
          <h2 className="mb-4 text-lg font-semibold text-slate-950">Entity notes section</h2>
          <div className="space-y-4">
            {rows.map((row) => (
              <div key={row.entityId} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">
                    {row.legalName} <span className="text-xs text-slate-400">({row.entityCode}, {row.jurisdictionCode}, {row.consolidationMethod}, {row.ownershipPct}% owned)</span>
                  </p>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${FLAG_STYLE[row.flagLevel]}`}>{row.flagLevel}</span>
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  Standalone net income:{" "}
                  <span className={row.standaloneNetIncomeLocal < 0 ? "font-semibold text-red-600" : "font-semibold"}>
                    {formatMoney({ value: row.standaloneNetIncomeLocal, currency: row.localCurrency }, LOCALE)}
                  </span>{" "}
                  ({formatMoney({ value: row.standaloneNetIncomeGroupCcy, currency: row.groupCurrency }, LOCALE)}) · included in group total at {row.inclusionPct}%
                </p>
                {row.notes.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
                    {row.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
