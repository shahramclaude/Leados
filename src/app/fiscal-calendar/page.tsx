import GlobalOpsNav from "@/components/GlobalOpsNav";
import { listAllEntities, listEntityGroups } from "@/lib/global-ops/repository";
import { generateFiscalPeriods, alignPeriodsToWindow } from "@/lib/global-ops/fiscalCalendar";
import { formatFiscalPeriodLabel } from "@/lib/global-ops/format";

export const dynamic = "force-dynamic";

const CALENDAR_TYPE_LABEL: Record<string, string> = {
  calendar: "Calendar (12 full months)",
  "445": "Retail 4-4-5",
  "544": "Retail 5-4-4",
  "454": "Retail 4-5-4",
  custom: "Custom (explicit periods)",
};

export default async function FiscalCalendarPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const params = await searchParams;
  const fiscalYear = Number.parseInt(params.fy ?? "2025", 10);
  const [entities, groups] = await Promise.all([listAllEntities(), listEntityGroups()]);
  const groupById = new Map(groups.map((g) => [g.id, g]));

  // Group reporting window reference: a plain calendar-year matrix of 12 months, used to show
  // how non-calendar entities (e.g. 4-4-5) map onto the group's own fiscal months.
  const groupWindows = generateFiscalPeriods({ fiscalCalendarType: "calendar", fiscalCalendarConfig: { yearStartMonth: 1 } }, fiscalYear);

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <GlobalOpsNav active="/fiscal-calendar" />
        <header className="mb-8">
          <p className="text-sm uppercase tracking-[0.08em] text-slate-600">Part 37 · Global Operations</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Fiscal Calendar Matrix — FY{fiscalYear}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Every entity runs its own fiscal calendar. The period-alignment engine below maps a non-calendar entity&apos;s
            periods onto the group&apos;s own calendar-month reporting windows without ever double-counting a day.
          </p>
        </header>

        <section className="space-y-6">
          {entities.map((entity) => {
            const periods = generateFiscalPeriods(entity, fiscalYear);
            const group = groupById.get(entity.groupId);
            return (
              <div key={entity.id} className="rounded-3xl bg-white p-6 shadow-[0_12px_40px_rgba(16,24,40,0.08)]">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">{entity.legalName} <span className="text-xs font-normal text-slate-400">({entity.code}, {group?.code})</span></h2>
                    <p className="text-xs text-slate-500">
                      {CALENDAR_TYPE_LABEL[entity.fiscalCalendarType]} · timezone {entity.timezone} · locale {entity.localeTag}
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {periods.map((p) => (
                    <div key={p.fiscalPeriod} className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700">
                      {formatFiscalPeriodLabel(p.label, p.startDate, p.endDate, entity.localeTag)}
                    </div>
                  ))}
                </div>

                {entity.fiscalCalendarType !== "calendar" && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-slate-700">
                      Period-alignment into group calendar months
                    </summary>
                    <table className="mt-3 w-full text-left text-xs">
                      <thead>
                        <tr className="uppercase text-slate-500">
                          <th className="py-1 pr-3">Group month</th>
                          <th className="py-1 pr-3">Entity period(s) overlapping</th>
                          <th className="py-1 pr-3">Overlap days</th>
                          <th className="py-1 pr-3">Fraction of entity period</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupWindows.map((w) => {
                          const overlaps = alignPeriodsToWindow(periods, w.startDate, w.endDate);
                          if (overlaps.length === 0) return null;
                          return overlaps.map((o) => (
                            <tr key={`${w.fiscalPeriod}-${o.period.fiscalPeriod}`} className="border-t border-slate-100">
                              <td className="py-1 pr-3">{w.label}</td>
                              <td className="py-1 pr-3">{o.period.label}</td>
                              <td className="py-1 pr-3">{o.overlapDays}</td>
                              <td className="py-1 pr-3">{(o.fractionOfPeriod * 100).toFixed(1)}%</td>
                            </tr>
                          ));
                        })}
                      </tbody>
                    </table>
                  </details>
                )}
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
